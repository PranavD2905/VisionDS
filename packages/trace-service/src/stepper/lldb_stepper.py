"""VisionDS lldb stepper — the C++ (and any lldb-debuggable language) analog of
harness.py's sys.settrace tracer.

Given a compiled binary with debug info, an entry function name, and the source
line range that belongs to the student's code, it single-steps the program and
emits — as one JSON object on stdout — the same step shape the Python tracer
produces: one snapshot per executed student line, each with capped, kind-tagged
local-variable values. The Node service wraps this into an ExecutionTrace.

Run under lldb's bundled Python:  PYTHONPATH="$(lldb -P)" python3 lldb_stepper.py
"""

import json
import re
import sys
import time

import lldb

# Caps mirror packages/trace-schema/src/caps.ts; passed in so all runners share them.
CAPS = {
    "MAX_STEPS": 10_000,
    "MAX_COLLECTION_ITEMS": 100,
    "MAX_STRING_LEN": 200,
    "MAX_DEPTH": 3,
    "WALL_CLOCK_MS": 5_000,
}

RESULT_SENTINEL = "__VISIONDS_RESULT__"


# ----------------------------------------------------------- value conversion

_INT_RE = re.compile(r"^-?\d+$")
_FLOAT_RE = re.compile(r"^-?\d+\.\d+(e-?\d+)?$", re.I)


def _scalar_from_str(raw):
    """Best-effort convert an lldb leaf value string to a JSON scalar."""
    if raw is None:
        return None
    s = raw.strip()
    if s in ("true", "false"):
        return s == "true"
    if _INT_RE.match(s):
        try:
            n = int(s)
            return n if abs(n) <= 2**53 else s
        except ValueError:
            return s
    if _FLOAT_RE.match(s):
        try:
            return float(s)
        except ValueError:
            return s
    # char like 'a' (lldb often shows  99 'c'); take the quoted part if present
    m = re.search(r"'(.*)'", s)
    if m:
        return m.group(1)
    return s


def _kind_of(type_name, value):
    tn = type_name.replace("std::__1::", "std::").replace("std::__cxx11::", "std::")
    if isinstance(value, list):
        if value and all(isinstance(x, list) for x in value):
            return "matrix"
        return "array"
    if isinstance(value, dict):
        return "dict"
    if "basic_string" in tn or tn in ("std::string", "char *", "const char *"):
        return "string"
    return "scalar"


def _is_container(tn):
    return any(
        k in tn
        for k in (
            "vector", "deque", "array", "list",
            "set", "map", "stack", "queue",
        )
    )


def _is_map(tn):
    return "map" in tn  # unordered_map / map / multimap


def _is_set(tn):
    return "set" in tn and "map" not in tn


def _convert(v, depth, state):
    """SBValue -> JSON-safe, capped, kind-aware. Marks state['truncated']."""
    tn = v.GetType().GetName() if v.GetType() else ""
    tn_norm = tn.replace("std::__1::", "std::").replace("std::__cxx11::", "std::")

    # strings: prefer the summary lldb gives ("hello")
    if "basic_string" in tn_norm or tn_norm in ("std::string",):
        summ = v.GetSummary()
        if summ is not None:
            s = summ.strip()
            if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
                s = s[1:-1]
            if len(s) > CAPS["MAX_STRING_LEN"]:
                state["truncated"] = True
                s = s[: CAPS["MAX_STRING_LEN"]] + "…"
            return s

    if depth >= CAPS["MAX_DEPTH"]:
        state["truncated"] = True
        summ = v.GetSummary() or v.GetValue() or v.GetTypeName()
        return str(summ)[: CAPS["MAX_STRING_LEN"]]

    # container adapters (stack / queue / priority_queue) hold their elements in
    # an underlying member `c`; expose that as an ordered array so the client's
    # behavior-based shape inference can tag it stack vs queue.
    if re.search(r"\b(stack|queue|priority_queue)<", tn_norm):
        c = v.GetChildMemberWithName("c")
        target = c if c.IsValid() and c.GetNumChildren() >= 0 else v
        items = []
        n = target.GetNumChildren()
        for i in range(min(n, CAPS["MAX_COLLECTION_ITEMS"])):
            items.append(_convert(target.GetChildAtIndex(i), depth + 1, state))
        if n > CAPS["MAX_COLLECTION_ITEMS"]:
            state["truncated"] = True
            items.append("…")
        return items

    if _is_map(tn_norm):
        out = {}
        n = v.GetNumChildren()
        for i in range(min(n, CAPS["MAX_COLLECTION_ITEMS"])):
            pair = v.GetChildAtIndex(i)
            # libc++ map elements expose .first / .second
            first = pair.GetChildMemberWithName("first")
            second = pair.GetChildMemberWithName("second")
            if first.IsValid() and second.IsValid():
                key = _convert(first, depth + 1, state)
                out[str(key)] = _convert(second, depth + 1, state)
            else:
                # some formatters name the child "[key]" with the value as child
                name = pair.GetName() or str(i)
                key = name.strip("[]")
                out[key] = _convert(pair, depth + 1, state)
        if n > CAPS["MAX_COLLECTION_ITEMS"]:
            state["truncated"] = True
        return out

    if _is_container(tn_norm):
        items = []
        n = v.GetNumChildren()
        for i in range(min(n, CAPS["MAX_COLLECTION_ITEMS"])):
            items.append(_convert(v.GetChildAtIndex(i), depth + 1, state))
        if n > CAPS["MAX_COLLECTION_ITEMS"]:
            state["truncated"] = True
            items.append("…")
        return items

    # leaf scalar
    val = v.GetValue()
    if val is None:
        summ = v.GetSummary()
        if summ is not None:
            return _scalar_from_str(summ)
        # aggregate/struct we don't model — short repr
        state["truncated"] = True
        return (v.GetTypeName() or "?")[: CAPS["MAX_STRING_LEN"]]
    return _scalar_from_str(val)


def _snapshot(frame, cur_line):
    out = []
    seen = set()
    for v in frame.GetVariables(True, True, False, True):  # args, locals, no statics, in scope
        name = v.GetName()
        if not name or name.startswith("__") or name in ("this", "self") or name in seen:
            continue
        # Hide a local until execution is strictly PAST its declaration line: on
        # the line that declares/initialises it, the value is still pre-assignment
        # garbage (an uninitialised int, or a half-constructed container reading
        # bogus buckets). Function parameters have no declaration line and always
        # show. Revisits to a loop header hide the counter — a fair trade for
        # never showing garbage.
        decl = v.GetDeclaration()
        if decl.IsValid():
            dl = decl.GetLine()
            if dl and dl >= cur_line:
                continue
        seen.add(name)
        state = {"truncated": False}
        kind, value = _kind_value(v, state)
        snap = {"name": name, "kind": kind, "value": value}
        if state["truncated"]:
            snap["truncated"] = True
        out.append(snap)
    return out


# ------------------------------------------------ pointer-linked structures

def _node_val(node, state):
    """The `val` member of a ListNode/TreeNode, as a JSON scalar."""
    val = node.GetChildMemberWithName("val")
    if not val.IsValid():
        val = node.GetChildMemberWithName("value")
    return _convert(val, 1, state) if val.IsValid() else None


def _linked_list(ptr, state):
    """Walk a ListNode* into {vals, cyclesTo} — cyclesTo is the index a tail
    points back to (Floyd-style cycle problems), else None."""
    vals = []
    seen = {}
    cur = ptr
    cycles_to = None
    while cur.IsValid() and cur.GetValueAsUnsigned() != 0:
        addr = cur.GetValueAsUnsigned()
        if addr in seen:
            cycles_to = seen[addr]
            break
        if len(vals) >= CAPS["MAX_COLLECTION_ITEMS"]:
            state["truncated"] = True
            break
        seen[addr] = len(vals)
        node = cur.Dereference()
        vals.append(_node_val(node, state))
        cur = node.GetChildMemberWithName("next")
    return {"vals": vals, "cyclesTo": cycles_to}


def _tree(ptr, state, budget):
    """Recursively convert a TreeNode* into {val, left, right} (children null or
    nested), capped by a shared node budget."""
    if not ptr.IsValid() or ptr.GetValueAsUnsigned() == 0:
        return None
    if budget[0] <= 0:
        state["truncated"] = True
        return None
    budget[0] -= 1
    node = ptr.Dereference()
    return {
        "val": _node_val(node, state),
        "left": _tree(node.GetChildMemberWithName("left"), state, budget),
        "right": _tree(node.GetChildMemberWithName("right"), state, budget),
    }


def _kind_value(v, state):
    """(kind, value) for a variable — intercepts ListNode*/TreeNode* pointers
    (whose kind can't be read from the JSON value), else falls back to the
    container/scalar conversion."""
    t = v.GetType()
    if t.IsValid() and t.IsPointerType():
        pointee = (t.GetPointeeType().GetName() or "") if t.GetPointeeType() else ""
        if "ListNode" in pointee:
            return "linkedlist", _linked_list(v, state)
        if "TreeNode" in pointee:
            return "tree", _tree(v, state, [CAPS["MAX_COLLECTION_ITEMS"]])
    value = _convert(v, 0, state)
    return _kind_of(v.GetTypeName() or "", value), value


# ------------------------------------------------------------------- stepping

def main():
    binary = sys.argv[1]
    student_start = int(sys.argv[2])
    student_end = int(sys.argv[3])
    entry = sys.argv[4]
    if len(sys.argv) > 5:
        CAPS.update(json.loads(sys.argv[5]))

    def in_student(frame):
        le = frame.GetLineEntry()
        if not le.IsValid():
            return False
        ln = le.GetLine()
        return student_start <= ln <= student_end

    dbg = lldb.SBDebugger.Create()
    dbg.SetAsync(False)
    target = dbg.CreateTarget(binary)
    if not target:
        print(json.dumps({"error": "could not load target"}))
        return
    target.BreakpointCreateByName(entry)

    err = lldb.SBError()
    launch_info = lldb.SBLaunchInfo([])
    launch_info.SetWorkingDirectory("/")
    proc = target.Launch(launch_info, err)
    if not proc or err.Fail():
        print(json.dumps({"error": "launch failed: %s" % err.GetCString()}))
        return

    steps = []
    limit = None
    start = time.monotonic()
    thread = proc.GetSelectedThread()
    base_frames = [None]  # frame count at the entry, so callDepth is relative to it

    def emit(event, extra=None):
        frame = thread.GetFrameAtIndex(0)
        line = frame.GetLineEntry().GetLine()
        step = {
            "index": len(steps),
            "line": line - student_start + 1,  # map back to student-file coords
            "event": event,
            "locals": _snapshot(frame, line),
            "stdout": "",
            "callDepth": max(0, thread.GetNumFrames() - base_frames[0]),
        }
        if extra:
            step.update(extra)
        steps.append(step)

    entered = False
    guard = 0
    while proc.GetState() == lldb.eStateStopped:
        guard += 1
        if guard > CAPS["MAX_STEPS"] * 3 + 1000:
            limit = "steps"
            break
        thread = proc.GetSelectedThread()
        frame = thread.GetFrameAtIndex(0)

        if in_student(frame):
            if base_frames[0] is None:
                base_frames[0] = thread.GetNumFrames()
            entered = True
            emit("line")
            if len(steps) >= CAPS["MAX_STEPS"]:
                limit = "steps"
                break
            if (time.monotonic() - start) * 1000 > CAPS["WALL_CLOCK_MS"]:
                limit = "time"
                break
            thread.StepInto()
            # StepInto may dive into STL/system code — climb back out to the
            # nearest student frame so we only ever record the student's lines.
            climb = 0
            while (
                proc.GetState() == lldb.eStateStopped
                and not in_student(proc.GetSelectedThread().GetFrameAtIndex(0))
                and climb < 64
            ):
                proc.GetSelectedThread().StepOut()
                climb += 1
        elif entered:
            # The entry function has returned; let the program run to completion
            # (so its stdout / result line is produced) instead of single-stepping
            # the C runtime.
            proc.Continue()
            break
        else:
            # Haven't reached student code yet — advance toward it.
            thread.StepOut()

    stdout = proc.GetSTDOUT(1 << 16) or ""
    result_json = None
    user_lines = []
    for ln in stdout.splitlines():
        if ln.startswith(RESULT_SENTINEL):
            result_json = ln[len(RESULT_SENTINEL):]
        else:
            user_lines.append(ln)
    if steps and user_lines:
        steps[-1]["stdout"] = "\n".join(user_lines)

    print(json.dumps({
        "steps": steps,
        "limit": limit,
        "resultJson": result_json,
        "exited": proc.GetState() == lldb.eStateExited,
    }))


if __name__ == "__main__":
    main()
