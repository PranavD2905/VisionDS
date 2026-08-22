import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.util.*;

/**
 * VisionDS Java stepper — the JDI analog of lldb_stepper.py / harness.py's
 * sys.settrace tracer. Launches a compiled harness (Main) under the Java Debug
 * Interface, single-steps the student's Solution class, and emits — as one JSON
 * object on stdout — the same step shape the other runners produce: one snapshot
 * per executed line, each with capped, kind-tagged local-variable values.
 *
 * Args: <targetClasspath> <mainClass> <entryClass> <entryMethod> <studentStart> <capsJson>
 */
public class VisionDsTracer {
    static int MAX_STEPS = 10_000, MAX_ITEMS = 100, MAX_STRLEN = 200, MAX_DEPTH = 3, WALL_MS = 5_000;
    static final String SENTINEL = "__VISIONDS_RESULT__";

    public static void main(String[] args) throws Exception {
        String cp = args[0], mainClass = args[1], entryClass = args[2], entryMethod = args[3];
        int studentStart = Integer.parseInt(args[4]);
        if (args.length > 5) applyCaps(args[5]);

        LaunchingConnector conn = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> a = conn.defaultArguments();
        a.get("main").setValue(mainClass);
        a.get("options").setValue("-cp " + cp);
        VirtualMachine vm = conn.launch(a);

        // Drain the target's stdout so we can extract the result sentinel + user prints.
        StringBuilder targetOut = new StringBuilder();
        Process proc = vm.process();
        Thread outT = pump(proc.getInputStream(), targetOut);
        Thread errT = pump(proc.getErrorStream(), new StringBuilder());
        outT.start();
        errT.start();

        EventRequestManager erm = vm.eventRequestManager();
        MethodEntryRequest mer = erm.createMethodEntryRequest();
        mer.addClassFilter(entryClass);
        mer.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
        mer.enable();

        List<String> steps = new ArrayList<>();
        String limit = null;
        long start = System.currentTimeMillis();
        int baseFrames = -1;
        StepRequest step = null;
        EventQueue q = vm.eventQueue();

        outer:
        while (true) {
            EventSet es;
            try { es = q.remove(); } catch (VMDisconnectedException e) { break; }
            for (Event ev : es) {
                if (ev instanceof MethodEntryEvent me && step == null) {
                    if (me.method().name().equals(entryMethod)) {
                        ThreadReference t = me.thread();
                        baseFrames = t.frameCount();
                        steps.add(snapshot(t, entryClass, studentStart, baseFrames));
                        step = erm.createStepRequest(t, StepRequest.STEP_LINE, StepRequest.STEP_INTO);
                        for (String ex : new String[]{"java.*", "javax.*", "sun.*", "jdk.*", "com.sun.*", "Main", "VisionDsTracer"})
                            step.addClassExclusionFilter(ex);
                        step.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
                        step.enable();
                        mer.disable();
                    }
                } else if (ev instanceof StepEvent se) {
                    if (isStudent(se.location().declaringType().name(), entryClass)) {
                        steps.add(snapshot(se.thread(), entryClass, studentStart, baseFrames));
                        if (steps.size() >= MAX_STEPS) { limit = "steps"; break outer; }
                        if (System.currentTimeMillis() - start > WALL_MS) { limit = "time"; break outer; }
                    }
                } else if (ev instanceof VMDeathEvent || ev instanceof VMDisconnectEvent) {
                    break outer;
                }
            }
            es.resume();
        }
        try { vm.resume(); } catch (Exception ignore) {}
        try { vm.exit(0); } catch (Exception ignore) {}
        try { outT.join(1500); } catch (Exception ignore) {}

        // Split the target stdout into the result line and the student's own prints.
        String resultJson = null;
        StringBuilder user = new StringBuilder();
        for (String ln : targetOut.toString().split("\n", -1)) {
            if (ln.startsWith(SENTINEL)) resultJson = ln.substring(SENTINEL.length());
            else if (!ln.isEmpty()) user.append(user.length() > 0 ? "\n" : "").append(ln);
        }
        if (!steps.isEmpty() && user.length() > 0) {
            String last = steps.get(steps.size() - 1);
            steps.set(steps.size() - 1, last.substring(0, last.length() - 1) + ",\"stdout\":" + jsonStr(user.toString()) + "}");
        }

        StringBuilder out = new StringBuilder("{\"steps\":[");
        for (int i = 0; i < steps.size(); i++) { if (i > 0) out.append(","); out.append(steps.get(i)); }
        out.append("],\"limit\":").append(limit == null ? "null" : jsonStr(limit));
        out.append(",\"resultJson\":").append(resultJson == null ? "null" : jsonStr(resultJson));
        out.append(",\"exited\":true}");
        System.out.println(out);
    }

    static boolean isStudent(String cls, String entryClass) {
        return cls.equals(entryClass) || cls.startsWith(entryClass + "$");
    }

    // --------------------------------------------------------- snapshot

    static String snapshot(ThreadReference t, String entryClass, int studentStart, int baseFrames) {
        StringBuilder sb = new StringBuilder("{");
        try {
            StackFrame f = t.frame(0);
            int line = f.location().lineNumber() - studentStart + 1;
            int depth = Math.max(0, t.frameCount() - baseFrames);
            sb.append("\"index\":0,\"line\":").append(line).append(",\"event\":\"line\",\"callDepth\":").append(depth);
            sb.append(",\"func\":").append(jsonStr(f.location().method().name()));
            sb.append(",\"stdout\":\"\",\"locals\":[");
            boolean first = true;
            Set<String> seen = new HashSet<>();
            List<LocalVariable> vars;
            try { vars = f.visibleVariables(); } catch (AbsentInformationException e) { vars = Collections.emptyList(); }
            for (LocalVariable v : vars) {
                String name = v.name();
                if (name.startsWith("$") || !seen.add(name)) continue;
                Value val = f.getValue(v);
                boolean[] trunc = {false};
                String kind = kindOf(val);
                String json = convert(val, 0, trunc);
                if (!first) sb.append(",");
                first = false;
                sb.append("{\"name\":").append(jsonStr(name)).append(",\"kind\":").append(jsonStr(kind))
                  .append(",\"value\":").append(json);
                if (trunc[0]) sb.append(",\"truncated\":true");
                sb.append("}");
            }
            sb.append("]");
        } catch (Exception e) {
            sb.append("\"index\":0,\"line\":1,\"event\":\"line\",\"callDepth\":0,\"stdout\":\"\",\"locals\":[]");
        }
        return sb.append("}").toString();
    }

    // --------------------------------------------------------- kinds

    static String kindOf(Value v) {
        if (v instanceof StringReference) return "string";
        if (v instanceof ArrayReference ar) {
            String comp = ar.type() instanceof ArrayType at ? at.componentTypeName() : "";
            return comp.endsWith("[]") ? "matrix" : "array";
        }
        if (v instanceof ObjectReference o) {
            String n = o.referenceType().name();
            if (isType(o, "ListNode")) return "linkedlist";
            if (isType(o, "TreeNode")) return "tree";
            if (implementsIface(o, "java.util.Map")) return "dict";
            if (implementsIface(o, "java.util.Set")) return "set";
            if (implementsIface(o, "java.util.List")) return "array";
            if (n.equals("java.lang.Character")) return "scalar";
        }
        return "scalar";
    }

    static boolean isType(ObjectReference o, String simple) {
        String n = o.referenceType().name();
        return n.equals(simple) || n.endsWith("." + simple) || n.endsWith("$" + simple);
    }

    static boolean implementsIface(ObjectReference o, String iface) {
        if (!(o.referenceType() instanceof ClassType ct)) return false;
        for (InterfaceType it : ct.allInterfaces()) if (it.name().equals(iface)) return true;
        return false;
    }

    // --------------------------------------------------------- value -> JSON

    static String convert(Value v, int depth, boolean[] trunc) {
        if (v == null) return "null";
        if (v instanceof BooleanValue b) return b.value() ? "true" : "false";
        if (v instanceof CharValue c) return jsonStr(String.valueOf(c.value()));
        if (v instanceof IntegerValue || v instanceof LongValue || v instanceof ShortValue || v instanceof ByteValue)
            return v.toString();
        if (v instanceof DoubleValue || v instanceof FloatValue) return v.toString();
        if (v instanceof StringReference s) return jsonStr(cap(s.value(), trunc));
        if (depth >= MAX_DEPTH) { trunc[0] = true; return jsonStr(shortRepr(v)); }
        if (v instanceof ArrayReference ar) return jsonArray(ar.getValues(), depth, trunc);
        if (v instanceof ObjectReference o) {
            if (isType(o, "ListNode")) return linkedList(o, trunc);
            if (isType(o, "TreeNode")) return tree(o, depth, trunc, new int[]{MAX_ITEMS});
            if (implementsIface(o, "java.util.Map")) return mapJson(o, depth, trunc);
            if (implementsIface(o, "java.util.Set")) return setJson(o, depth, trunc);
            if (implementsIface(o, "java.util.List")) return listJson(o, depth, trunc);
            if (o.referenceType().name().equals("java.lang.Character")) {
                Value cv = fieldVal(o, "value");
                return cv instanceof CharValue cc ? jsonStr(String.valueOf(cc.value())) : jsonStr(shortRepr(o));
            }
            // boxed numbers / booleans
            Value boxed = fieldVal(o, "value");
            if (boxed != null && !(boxed instanceof ObjectReference)) return convert(boxed, depth, trunc);
        }
        return jsonStr(shortRepr(v));
    }

    static String jsonArray(List<Value> vs, int depth, boolean[] trunc) {
        StringBuilder sb = new StringBuilder("[");
        int n = Math.min(vs.size(), MAX_ITEMS);
        for (int i = 0; i < n; i++) { if (i > 0) sb.append(","); sb.append(convert(vs.get(i), depth + 1, trunc)); }
        if (vs.size() > MAX_ITEMS) { trunc[0] = true; sb.append(",\"…\""); }
        return sb.append("]").toString();
    }

    static String listJson(ObjectReference o, int depth, boolean[] trunc) {
        try {
            ThreadReference t = o.owningThread() != null ? o.owningThread() : anyThread(o);
            List<Value> vals = new ArrayList<>();
            IntegerValue size = (IntegerValue) invoke(o, "size", "()I", Collections.emptyList());
            int n = Math.min(size.value(), MAX_ITEMS);
            Method get = method(o, "get", 1);
            for (int i = 0; i < n; i++)
                vals.add(invoke(o, get, Collections.singletonList(o.virtualMachine().mirrorOf(i))));
            String body = jsonArray(vals, depth, trunc);
            if (size.value() > MAX_ITEMS) trunc[0] = true;
            return body;
        } catch (Exception e) { return jsonStr(shortRepr(o)); }
    }

    static String mapJson(ObjectReference o, int depth, boolean[] trunc) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        try {
            // HashMap allocates `table` lazily — a null table means an empty map.
            Value tableV = fieldVal(o, "table");
            if (tableV instanceof ArrayReference table) {
                int count = 0;
                for (Value bucketV : table.getValues()) {
                    Value node = bucketV;
                    while (node instanceof ObjectReference nr) {
                        if (count++ >= MAX_ITEMS) { trunc[0] = true; node = null; break; }
                        if (!first) sb.append(",");
                        first = false;
                        sb.append(jsonStr(scalarKey(fieldVal(nr, "key")))).append(":")
                          .append(convert(fieldVal(nr, "value"), depth + 1, trunc));
                        node = fieldVal(nr, "next");
                    }
                }
            } else if (o.referenceType().fieldByName("table") == null) {
                return jsonStr(shortRepr(o)); // not a table-backed map (e.g. TreeMap)
            }
            return sb.append("}").toString();
        } catch (Exception ignore) {}
        return jsonStr(shortRepr(o));
    }

    static String setJson(ObjectReference o, int depth, boolean[] trunc) {
        Value mapV = fieldVal(o, "map");
        if (!(mapV instanceof ObjectReference mr)) return jsonStr(shortRepr(o));
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        try {
            Value tableV = fieldVal(mr, "table");
            if (tableV instanceof ArrayReference table) {
                int count = 0;
                for (Value bucketV : table.getValues()) {
                    Value node = bucketV;
                    while (node instanceof ObjectReference nr) {
                        if (count++ >= MAX_ITEMS) { trunc[0] = true; node = null; break; }
                        if (!first) sb.append(",");
                        first = false;
                        sb.append(convert(fieldVal(nr, "key"), depth + 1, trunc));
                        node = fieldVal(nr, "next");
                    }
                }
            }
            return sb.append("]").toString(); // null table -> empty set
        } catch (Exception ignore) {}
        return jsonStr(shortRepr(o));
    }

    static String linkedList(ObjectReference head, boolean[] trunc) {
        StringBuilder vals = new StringBuilder("[");
        Map<Long, Integer> seen = new HashMap<>();
        Integer cyclesTo = null;
        ObjectReference cur = head;
        int i = 0;
        boolean first = true;
        while (cur != null) {
            long id = cur.uniqueID();
            if (seen.containsKey(id)) { cyclesTo = seen.get(id); break; }
            if (i >= MAX_ITEMS) { trunc[0] = true; break; }
            seen.put(id, i++);
            if (!first) vals.append(",");
            first = false;
            vals.append(convert(fieldVal(cur, "val"), 1, trunc));
            Value next = fieldVal(cur, "next");
            cur = next instanceof ObjectReference nr ? nr : null;
        }
        vals.append("]");
        return "{\"vals\":" + vals + ",\"cyclesTo\":" + (cyclesTo == null ? "null" : cyclesTo) + "}";
    }

    static String tree(ObjectReference node, int depth, boolean[] trunc, int[] budget) {
        if (node == null) return "null";
        if (budget[0] <= 0) { trunc[0] = true; return "null"; }
        budget[0]--;
        String val = convert(fieldVal(node, "val"), depth + 1, trunc);
        Value l = fieldVal(node, "left"), r = fieldVal(node, "right");
        String left = l instanceof ObjectReference lr ? tree(lr, depth + 1, trunc, budget) : "null";
        String right = r instanceof ObjectReference rr ? tree(rr, depth + 1, trunc, budget) : "null";
        return "{\"val\":" + val + ",\"left\":" + left + ",\"right\":" + right + "}";
    }

    // --------------------------------------------------------- helpers

    static Value fieldVal(ObjectReference o, String name) {
        Field f = o.referenceType().fieldByName(name);
        return f == null ? null : o.getValue(f);
    }

    static String scalarKey(Value v) {
        boolean[] t = {false};
        String s = convert(v, 2, t);
        if (s.length() >= 2 && s.charAt(0) == '"') return s.substring(1, s.length() - 1);
        return s;
    }

    static Method method(ObjectReference o, String name, int argc) {
        for (Method m : o.referenceType().methodsByName(name))
            if (m.argumentTypeNames().size() == argc) return m;
        return null;
    }

    static Value invoke(ObjectReference o, String name, String sig, List<Value> args) throws Exception {
        for (Method m : o.referenceType().methodsByName(name))
            if (m.signature().equals(sig)) return invoke(o, m, args);
        throw new NoSuchMethodException(name);
    }

    static Value invoke(ObjectReference o, Method m, List<Value> args) throws Exception {
        ThreadReference t = anyThread(o);
        return o.invokeMethod(t, m, args, ObjectReference.INVOKE_SINGLE_THREADED);
    }

    static ThreadReference anyThread(ObjectReference o) {
        for (ThreadReference t : o.virtualMachine().allThreads())
            if (t.isSuspended() && t.name().equals("main")) return t;
        for (ThreadReference t : o.virtualMachine().allThreads())
            if (t.isSuspended()) return t;
        return o.virtualMachine().allThreads().get(0);
    }

    static String shortRepr(Value v) {
        String s = v instanceof ObjectReference o ? o.referenceType().name() : String.valueOf(v);
        return cap(s, new boolean[1]);
    }

    static String cap(String s, boolean[] trunc) {
        if (s.length() > MAX_STRLEN) { trunc[0] = true; return s.substring(0, MAX_STRLEN) + "…"; }
        return s;
    }

    static String jsonStr(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> { if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c); }
            }
        }
        return sb.append("\"").toString();
    }

    static Thread pump(java.io.InputStream in, StringBuilder sink) {
        return new Thread(() -> {
            try {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) != -1) synchronized (sink) { sink.append(new String(buf, 0, n)); }
            } catch (Exception ignore) {}
        });
    }

    static void applyCaps(String json) {
        MAX_STEPS = capVal(json, "MAX_STEPS", MAX_STEPS);
        MAX_ITEMS = capVal(json, "MAX_COLLECTION_ITEMS", MAX_ITEMS);
        MAX_STRLEN = capVal(json, "MAX_STRING_LEN", MAX_STRLEN);
        MAX_DEPTH = capVal(json, "MAX_DEPTH", MAX_DEPTH);
        WALL_MS = capVal(json, "WALL_CLOCK_MS", WALL_MS);
    }

    static int capVal(String json, String key, int def) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"" + key + "\"\\s*:\\s*(\\d+)").matcher(json);
        return m.find() ? Integer.parseInt(m.group(1)) : def;
    }
}
