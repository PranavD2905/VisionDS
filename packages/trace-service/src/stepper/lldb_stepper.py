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


def _ref(v):
    """Object identity for the stage's alias detection: a reference or pointer
    names the object it refers to, anything else its own storage. A helper's
    `vector<int>& arr` and the caller's `nums` then share one ref."""
    t = v.GetType()
    if t.IsReferenceType():
        addr = v.Dereference().GetLoadAddress()
    elif t.IsPointerType():
        addr = v.GetValueAsUnsigned()
    else:
        addr = v.GetLoadAddress()
    return "c%x" % addr if addr and addr != lldb.LLDB_INVALID_ADDRESS else None


def _snapshot(frame, cur_line, structures_only=False):
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
        if structures_only and kind == "scalar":
            continue
        snap = {"name": name, "kind": kind, "value": value}
        if kind not in ("scalar", "string"):
            ref = _ref(v)
            if ref:
                snap["ref"] = ref
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


def _func_name(frame):
    """Bare function name for the call tree: lldb hands back a full signature
    (`Solution::dfs(std::vector<int>&, int)`), which is unreadable as a node
    label."""
    name = frame.GetFunctionName() or ""
    return name.split("(")[0].split("::")[-1].strip()


def _break_on_entry(target, entry, entry_line, student_start, student_end):
    """Break on the student's own `entry` and nothing else.

    A bare-name breakpoint also matches every same-named symbol in the binary
    and the libraries it loads — `merge`, `rotate`, `add` all exist in libc++
    — and stopping in one of those first left the stepper climbing out of
    library code until the step cap, with zero student steps recorded. By
    name (so lldb still skips the prologue and arguments are readable), then
    every location outside the student's lines is disabled; of the rest, only
    the overload starting nearest `entry_line` stays on.
    """
    # Scoped to the program's own module: library locations resolve lazily
    # after launch and would otherwise appear enabled.
    bp = target.BreakpointCreateByName(entry, target.GetExecutable().GetFilename())
    student = []
    for loc in bp:
        line = loc.GetAddress().GetLineEntry().GetLine()
        if student_start <= line <= student_end:
            student.append(loc)
        else:
            loc.SetEnabled(False)
    if len(student) > 1:
        def start_line(loc):
            fn = loc.GetAddress().GetFunction()
            return fn.GetStartAddress().GetLineEntry().GetLine() if fn.IsValid() else 0
        keep = min(student, key=lambda loc: abs(start_line(loc) - entry_line))
        for loc in student:
            if loc is not keep:
                loc.SetEnabled(False)


def main():
    binary = sys.argv[1]
    student_start = int(sys.argv[2])
    student_end = int(sys.argv[3])
    entry = sys.argv[4]
    # 1-based line of the entry's name in the generated file; picks the right
    # overload when several student functions share the entry's name.
    entry_line = int(sys.argv[5])
    if len(sys.argv) > 6:
        CAPS.update(json.loads(sys.argv[6]))

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
    _break_on_entry(target, entry, entry_line, student_start, student_end)

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

    # Frame activations, outermost first: [(cfa, func, id)]. A frame keeps its
    # id while it and every frame beneath it are unchanged between steps; a
    # helper re-entered at the same stack address after a return gets a new id
    # because the caller's own step lands in between.
    active = []
    next_id = [0]

    def frame_ids():
        frames = []
        for i in range(thread.GetNumFrames()):
            f = thread.GetFrameAtIndex(i)
            if not in_student(f):
                break
            frames.append((f.GetCFA(), _func_name(f)))
        frames.reverse()
        ids = []
        for depth, (cfa, func) in enumerate(frames):
            kept_below = depth == 0 or ids[depth - 1] == active[depth - 1][2]
            if kept_below and depth < len(active) and active[depth][:2] == (cfa, func):
                ids.append(active[depth][2])
            else:
                ids.append(next_id[0])
                next_id[0] += 1
        active[:] = [(c, f, i) for (c, f), i in zip(frames, ids)]
        return ids

    def emit(event, extra=None):
        frame = thread.GetFrameAtIndex(0)
        line = frame.GetLineEntry().GetLine()
        ids = frame_ids()
        step = {
            "index": len(steps),
            "line": line - student_start + 1,  # map back to student-file coords
            "event": event,
            "locals": _snapshot(frame, line),
            "func": _func_name(frame),
            "stdout": "",
            "callDepth": max(0, thread.GetNumFrames() - base_frames[0]),
        }
        if ids:
            step["frameId"] = ids[-1]
        caller = thread.GetFrameAtIndex(1)
        if len(ids) >= 2 and caller.IsValid() and in_student(caller):
            step["caller"] = {
                "func": _func_name(caller),
                "frameId": ids[-2],
                "locals": _snapshot(caller, caller.GetLineEntry().GetLine(), structures_only=True),
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
            # Before the entry the only stops are breakpoint hits, and every
            # breakpoint location outside the student's lines is disabled —
            # run on to the entry rather than stepping out of whatever this is
            # (stepping out of main ends the program with nothing recorded).
            proc.Continue()

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
