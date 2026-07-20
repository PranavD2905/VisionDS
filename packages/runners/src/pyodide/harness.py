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


def _find_entry(tree):
    """Last top-level def; else the last public method of `class Solution`."""
    funcs = [
        n for n in tree.body
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    if funcs:
        return funcs[-1].name, None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "Solution":
            methods = [
                m for m in node.body
                if isinstance(m, ast.FunctionDef) and not m.name.startswith("_")
            ]
            if methods:
                return methods[-1].name, node.name
    raise ValueError(
        "no entry point found: define a top-level function or a Solution class"
    )


# ----------------------------------------------------------- serialization

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
    return _short_repr(v, state)


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

def run_case(code, input_str, expected_str, caps_json):
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
        "code": code,
        "testCase": {"input": input_str, "expected": expected_str},
        "steps": [],
        "result": result,
    }

    def finish(verdict, **kw):
        result["verdict"] = verdict
        result.update(kw)
        return json.dumps(trace)

    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return finish("error", message="SyntaxError: %s" % e)
    try:
        entry_name, class_name = _find_entry(tree)
        args = _parse_args(input_str)
        expected = _parse_value(expected_str)
    except ValueError as e:
        return finish("error", message=str(e))

    g = {"__name__": "__main__"}
    try:
        exec(compile(code, STUDENT_FILE, "exec"), g)
        if class_name is None:
            fn = g[entry_name]
        else:
            fn = getattr(g[class_name](), entry_name)
    except BaseException as e:
        return finish(
            "error", message="%s while loading code: %s" % (type(e).__name__, e)
        )

    buf = io.StringIO()
    tracer = _Tracer(buf)
    exc = None
    ret = None
    with redirect_stdout(buf):
        sys.settrace(tracer)
        try:
            ret = fn(*args)
        except _Limit as e:
            tracer.limit = tracer.limit or e.kind
        except BaseException as e:
            exc = e
        finally:
            sys.settrace(None)

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
        kw = {"message": "%s: %s" % (type(exc).__name__, exc)}
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
