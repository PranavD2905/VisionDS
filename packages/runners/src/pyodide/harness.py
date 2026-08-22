"""VisionDS Python tracer harness.

Runs student code against one testcase under sys.settrace and emits an
ExecutionTrace (see @visionds/trace-schema) as a JSON string. Loaded into an
isolated namespace by the JS side; the only entry point is run_case().
"""

import ast
import io
import json
import sys
import time
import types
from collections import deque
from contextlib import redirect_stdout

STUDENT_FILE = "<student>"
SYSTEM_FILE = "<system>"
MAX_STDOUT = 4_000

# Overwritten from trace-schema caps by run_case; defaults are a safety net.
MAX_STEPS = 10_000
MAX_COLLECTION_ITEMS = 100
MAX_STRING_LEN = 200
MAX_DEPTH = 3
WALL_CLOCK_MS = 5_000


class _Limit(Exception):
    def __init__(self, kind):
        self.kind = kind  # 'steps' | 'time'


# ---------------------------------------------------------------- parsing

def _parse_value(text):
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    try:
        return ast.literal_eval(text)
    except Exception:
        raise ValueError("could not parse value: %r" % text)


def _parse_args(input_str):
    """One argument per line, LeetCode style. Accepts bare JSON/Python
    literals and 'name = literal' lines."""
    args = []
    for line in input_str.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        head, sep, tail = line.partition("=")
        if sep and head.strip().isidentifier():
            line = tail.strip()
        args.append(_parse_value(line))
    return args


def _list_entry_candidates(tree):
    """Every plausible entry candidate, in source order: top-level defs first,
    then public methods of `class Solution` — the full set an ambiguous
    submission could mean, not just the default pick."""
    candidates = []
    funcs = [
        n for n in tree.body
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    candidates.extend((f.name, None) for f in funcs)
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "Solution":
            methods = [
                m for m in node.body
                if isinstance(m, ast.FunctionDef) and not m.name.startswith("_")
            ]
            candidates.extend((m.name, node.name) for m in methods)
    return candidates


def _find_entry(tree):
    """Last top-level def; else the last public method of `class Solution`."""
    funcs = [c for c in _list_entry_candidates(tree) if c[1] is None]
    if funcs:
        return funcs[-1]
    methods = [c for c in _list_entry_candidates(tree) if c[1] is not None]
    if methods:
        return methods[-1]
    raise ValueError(
        "no entry point found: define a top-level function or a Solution class"
    )


def list_entry_candidates(code):
    """JSON-serializable candidate list, for the UI's ambiguity dropdown."""
    tree = ast.parse(code)
    return json.dumps([
        {"name": name, "className": class_name}
        for name, class_name in _list_entry_candidates(tree)
    ])


# ----------------------------------------------------------- serialization

_BUILTIN_VALUES = (str, bytes, int, float, bool, list, tuple, dict, set, frozenset, deque)


def _is_tree_node(v):
    """Duck-typed TreeNode: `val` + `left` + `right` (LeetCode convention)."""
    return (
        not isinstance(v, _BUILTIN_VALUES)
        and hasattr(v, "val") and hasattr(v, "left") and hasattr(v, "right")
    )


def _is_list_node(v):
    """Duck-typed ListNode: `val` + `next` (and not a tree node)."""
    return (
        not isinstance(v, _BUILTIN_VALUES)
        and hasattr(v, "val") and hasattr(v, "next")
        and not (hasattr(v, "left") and hasattr(v, "right"))
    )


def _kind_of(v):
    if isinstance(v, str):
        return "string"
    if isinstance(v, deque):
        # the canonical Python queue/stack — rendered as an ordered sequence
        return "array"
    if isinstance(v, (list, tuple)):
        if v and all(isinstance(x, (list, tuple)) for x in v):
            return "matrix"
        return "array"
    if isinstance(v, dict):
        return "dict"
    if isinstance(v, (set, frozenset)):
        return "set"
    if _is_tree_node(v):
        return "tree"
    if _is_list_node(v):
        return "linkedlist"
    return "scalar"


def _short_repr(v, state):
    state["truncated"] = True
    r = repr(v)
    return r[:MAX_STRING_LEN] + ("…" if len(r) > MAX_STRING_LEN else "")


def _convert(v, depth, state):
    """JSON-safe, depth/size-capped conversion. Marks state['truncated']."""
    if v is None or isinstance(v, bool):
        return v
    if isinstance(v, int):
        if abs(v) > 2**53:  # would lose precision as a JS number
            state["truncated"] = True
            return repr(v)
        return v
    if isinstance(v, float):
        if v != v or v == float("inf") or v == float("-inf"):
            return repr(v)
        return v
    if isinstance(v, str):
        if len(v) > MAX_STRING_LEN:
            state["truncated"] = True
            return v[:MAX_STRING_LEN] + "…"
        return v
    if depth >= MAX_DEPTH:
        return _short_repr(v, state)
    if isinstance(v, (list, tuple, deque)):
        seq = list(v)
        out = [_convert(x, depth + 1, state) for x in seq[:MAX_COLLECTION_ITEMS]]
        if len(seq) > MAX_COLLECTION_ITEMS:
            state["truncated"] = True
            out.append("…")
        return out
    if isinstance(v, dict):
        out = {}
        for i, (k, x) in enumerate(v.items()):
            if i >= MAX_COLLECTION_ITEMS:
                state["truncated"] = True
                out["…"] = "…"
                break
            key = k if isinstance(k, str) else repr(k)
            out[key[:MAX_STRING_LEN]] = _convert(x, depth + 1, state)
        return out
    if isinstance(v, (set, frozenset)):
        try:
            items = sorted(v)
        except TypeError:
            items = list(v)
        out = [_convert(x, depth + 1, state) for x in items[:MAX_COLLECTION_ITEMS]]
        if len(v) > MAX_COLLECTION_ITEMS:
            state["truncated"] = True
            out.append("…")
        return out
    if _is_tree_node(v):
        return _convert_tree(v, state)
    if _is_list_node(v):
        return _convert_list(v, state)
    return _short_repr(v, state)


def _convert_list(head, state):
    """Walk a ListNode chain into {vals, cyclesTo} (the linkedlist shape the
    C++/Java steppers emit). `cyclesTo` is the index the tail loops back to,
    or None; the walk is capped and cycle-safe by construction."""
    vals = []
    seen = {}
    cycles_to = None
    node = head
    while node is not None:
        if id(node) in seen:
            cycles_to = seen[id(node)]
            break
        if len(vals) >= MAX_COLLECTION_ITEMS:
            state["truncated"] = True
            break
        seen[id(node)] = len(vals)
        vals.append(_convert(getattr(node, "val", None), MAX_DEPTH - 1, state))
        node = getattr(node, "next", None)
    return {"vals": vals, "cyclesTo": cycles_to}


def _convert_tree(root, state):
    """Walk a TreeNode into nested {val, left, right}, capped by total node
    count and guarded against malformed (cyclic) trees."""
    budget = [MAX_COLLECTION_ITEMS]
    seen = set()

    def walk(node, depth):
        if node is None:
            return None
        if id(node) in seen or budget[0] <= 0 or depth > 32:
            state["truncated"] = True
            return None
        seen.add(id(node))
        budget[0] -= 1
        return {
            "val": _convert(getattr(node, "val", None), MAX_DEPTH - 1, state),
            "left": walk(getattr(node, "left", None), depth + 1),
            "right": walk(getattr(node, "right", None), depth + 1),
        }

    return walk(root, 0)


_SKIP_TYPES = (
    types.ModuleType,
    types.FunctionType,
    types.BuiltinFunctionType,
    types.MethodType,
    type,
)


def _snapshot_locals(f_locals):
    out = []
    for name, v in f_locals.items():
        if name.startswith("_") or name == "self":
            continue
        if isinstance(v, _SKIP_TYPES):
            continue
        state = {"truncated": False}
        snap = {"name": name, "kind": _kind_of(v), "value": _convert(v, 0, state)}
        if state["truncated"]:
            snap["truncated"] = True
        out.append(snap)
    return out


# ---------------------------------------------------------------- tracing

class _Tracer:
    def __init__(self, buf):
        self.steps = []
        self.depth = -1
        self.buf = buf
        self.start = time.monotonic()
        self.limit = None
        self._last_stdout = ""
        self._stdout_capped = False

    def _stdout(self):
        if self._stdout_capped:
            return self._last_stdout
        if self.buf.tell() != len(self._last_stdout):
            text = self.buf.getvalue()
            if len(text) > MAX_STDOUT:
                text = text[:MAX_STDOUT] + "\n… output truncated"
                self._stdout_capped = True
            self._last_stdout = text
        return self._last_stdout

    def __call__(self, frame, event, arg):
        if frame.f_code.co_filename != STUDENT_FILE:
            return None
        if self.limit:
            raise _Limit(self.limit)
        if event == "call":
            self.depth += 1
        step = {
            "index": len(self.steps),
            "line": frame.f_lineno,
            "event": event,
            "locals": _snapshot_locals(frame.f_locals),
            "func": frame.f_code.co_name,
            "stdout": self._stdout(),
            "callDepth": self.depth,
        }
        if event == "return":
            state = {"truncated": False}
            step["returnValue"] = _convert(arg, 0, state)
            self.depth -= 1
        elif event == "exception":
            exc_type, exc_value, _tb = arg
            step["exception"] = {
                "type": exc_type.__name__,
                "message": str(exc_value),
            }
        self.steps.append(step)
        if len(self.steps) >= MAX_STEPS:
            self.limit = "steps"
            raise _Limit(self.limit)
        if (time.monotonic() - self.start) * 1000 > WALL_CLOCK_MS:
            self.limit = "time"
            raise _Limit(self.limit)
        return self


# -------------------------------------------------------------- comparison

def _norm(v):
    if isinstance(v, tuple):
        v = list(v)
    if isinstance(v, list):
        return [_norm(x) for x in v]
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in v.items()}
    if isinstance(v, (set, frozenset)):
        try:
            return sorted(_norm(x) for x in v)
        except TypeError:
            return list(v)
    return v


# -------------------------------------------------------------- entry point

def default_system_code(entry_name, class_name):
    """The student-visible/editable call-site: imports (none needed by
    default) + a call into the detected entry, built from parsed args.
    `class_name` is an empty string (not None) when there is no class — JS
    `null` crossing the Pyodide FFI as a bare argument doesn't reliably
    become Python `None`."""
    if not class_name:
        call = "%s(*__vds_args__)" % entry_name
    else:
        call = "%s().%s(*__vds_args__)" % (class_name, entry_name)
    return "result = %s" % call


def run_case(system_code, student_code, input_str, expected_str, caps_json):
    caps = json.loads(caps_json)
    for name in (
        "MAX_STEPS", "MAX_COLLECTION_ITEMS", "MAX_STRING_LEN",
        "MAX_DEPTH", "WALL_CLOCK_MS",
    ):
        if name in caps:
            globals()[name] = caps[name]

    result = {"input": input_str, "expected": expected_str}
    trace = {
        "language": "python",
        "code": student_code,
        "systemCode": system_code,
        "testCase": {"input": input_str, "expected": expected_str},
        "steps": [],
        "result": result,
    }

    def finish(verdict, **kw):
        result["verdict"] = verdict
        result.update(kw)
        return json.dumps(trace)

    try:
        ast.parse(student_code)
    except SyntaxError as e:
        return finish("error", message="SyntaxError: %s" % e)
    try:
        args = _parse_args(input_str)
        expected = _parse_value(expected_str)
    except ValueError as e:
        return finish("error", message=str(e))

    g = {"__name__": "__main__"}
    try:
        exec(compile(student_code, STUDENT_FILE, "exec"), g)
    except BaseException as e:
        return finish(
            "error", message="%s while loading code: %s" % (type(e).__name__, e)
        )

    g["__vds_args__"] = args

    buf = io.StringIO()
    tracer = _Tracer(buf)
    exc = None
    ret = None
    with redirect_stdout(buf):
        try:
            call_code = compile(system_code, SYSTEM_FILE, "exec")
        except SyntaxError as e:
            return finish("error", message="error in generated call: SyntaxError: %s" % e)
        sys.settrace(tracer)
        try:
            exec(call_code, g)
            ret = g.get("result")
        except _Limit as e:
            tracer.limit = tracer.limit or e.kind
        except BaseException as e:
            exc = e
        finally:
            sys.settrace(None)

    # No student frame ever ran before the failure — the call-site itself is
    # broken (e.g. a typo'd function/method name after editing it), not the
    # student's actual logic.
    call_site_broken = exc is not None and tracer.limit is None and not tracer.steps
    trace["steps"] = tracer.steps
    steps = tracer.steps

    if tracer.limit:
        trace["truncated"] = True
        kw = {}
        if steps:
            kw["divergenceStepIndex"] = len(steps) - 1
        reason = (
            "step limit (%d steps) exceeded" % MAX_STEPS
            if tracer.limit == "steps"
            else "time limit (%d ms) exceeded" % WALL_CLOCK_MS
        )
        return finish("timeout", message=reason, **kw)

    if exc is not None:
        prefix = "error in generated call: " if call_site_broken else ""
        kw = {"message": "%s%s: %s" % (prefix, type(exc).__name__, exc)}
        exc_name = type(exc).__name__
        div = None
        for step in steps:
            if step["event"] == "exception" and step["exception"]["type"] == exc_name:
                div = step["index"]
                break
        if div is None and steps:
            div = len(steps) - 1
        if div is not None:
            kw["divergenceStepIndex"] = div
        return finish("error", **kw)

    state = {"truncated": False}
    result["actual"] = _convert(ret, 0, state)
    if _norm(ret) == _norm(expected):
        return finish("pass")

    kw = {}
    for step in reversed(steps):
        if step["event"] == "return" and step["callDepth"] == 0:
            kw["divergenceStepIndex"] = step["index"]
            break
    return finish("fail", **kw)
