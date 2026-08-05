/**
 * Spec-sheet content. Same principle as the landing catalogue: data only, so
 * the page stays composition and the copy stays editable without touching JSX.
 */

export const PIPELINE_ASCII = `  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
  │  CAPTURE     │      │  RUNNER      │      │  STAGE       │
  │  extension   │─────▶│  browser or  │─────▶│  animated    │
  │  or paste    │      │  trace svc   │      │  diagrams    │
  └──────────────┘      └──────┬───────┘      └──────▲───────┘
        code                   │                     │
        testcases              ▼                     │
                        ExecutionTrace ──────────────┘
                        steps[] · result · verdict
                        divergenceStepIndex`;

export const CONTRACT_FIELDS: Array<[string, string]> = [
  ['steps[]', 'One entry per traced line: event, line number, locals snapshot, stdout, exception.'],
  ['result.verdict', 'pass · fail · error · timeout — decided by comparing the return value with your expected output.'],
  ['result.divergenceStepIndex', 'The step the UI seeks to when you hit "jump to failing step".'],
  ['code', 'The exact source that was executed, so the code panel highlights the real line.'],
];

export interface LanguageSpec {
  name: string;
  where: string;
  how: string;
  covers: string;
  notes: string;
  state: string;
}

export const LANGUAGE_SPECS: LanguageSpec[] = [
  {
    name: 'Python',
    where: 'In your browser',
    how: 'A Web Worker boots Pyodide (served locally, not from a CDN) and runs your code under a sys.settrace tracer.',
    covers: 'list · dict · set · str · tuple · nested structures · stdout · exceptions',
    notes: 'A watchdog kills runaway loops the interpreter cannot interrupt — you get a clean timeout verdict, never a frozen tab.',
    state: 'live',
  },
  {
    name: 'C++',
    where: 'Local trace service',
    how: 'Your Solution is compiled into one translation unit with clang++ -g, then single-stepped by an lldb driver that reads locals as typed values.',
    covers: 'vector · string · map / unordered_map · set · std::stack · std::queue · ListNode · TreeNode · 2D vectors',
    notes: 'Arguments are typed from your method signature, so vector<char> and long long land correctly. Void, in-place solutions are supported.',
    state: 'live',
  },
  {
    name: 'Java',
    where: 'Local trace service',
    how: 'Solution.java plus a generated Main are compiled with javac -g and stepped by a JDI debugger that filters to your classes only.',
    covers: 'primitives · String · arrays (incl. 2D) · List · HashMap · HashSet · ListNode · TreeNode',
    notes: 'Needs a JDK on the machine running the service — auto-detected, or point VISIONDS_JAVA_HOME at one.',
    state: 'live',
  },
];

export const STRUCTURES: Array<[string, string]> = [
  ['Array', 'Indexed cells; values flash on change, boxes glide on swap.'],
  ['Matrix', 'Row/column headers, builds in a diagonal wave.'],
  ['Hash map', 'Key → value rows joined by drawn arrows.'],
  ['Set', 'Unordered chips, no implied order.'],
  ['Stack', 'A vertical pile with a top marker that rides the last element.'],
  ['Queue', 'A lane: front exits left, rear feeds in from the right.'],
  ['Linked list', 'Nodes chained by arrows, terminating in null or a cycle note.'],
  ['Binary tree', 'In-order layout with edges drawn beneath the nodes.'],
  ['Scalars', 'A quiet readout strip under the diagrams.'],
  ['Pointers', 'Inferred index variables, as chips that glide between cells.'],
];

export const CAPS: Array<[string, string, string]> = [
  ['Steps recorded', '10,000', 'Long runs are truncated, not dropped.'],
  ['Wall clock', '5 seconds', 'Then the verdict is timeout.'],
  ['Collection items', '100', 'Longer collections show a truncation mark.'],
  ['String length', '200 chars', 'Kept readable on the stage.'],
  ['Nesting depth', '3', 'Deeper values are summarised.'],
];

export const PRIVACY_TIERS = [
  {
    n: 'Python',
    title: 'Never leaves the machine',
    body: 'Pyodide is a WebAssembly Python running inside this tab. There is no upload, no request, no server involved in a Python run.',
  },
  {
    n: 'C++ / Java',
    title: 'Goes to the trace service',
    body: 'Compiled languages have no in-browser tracer, so the source is POSTed to the trace service, compiled, stepped and discarded. Today that service is one you run locally.',
  },
  {
    n: 'AI explain',
    title: 'Your key, your call',
    body: 'The explainer is opt-in. It uses a key you paste, stored only in this browser, and sends the code plus a compact digest of the trace — never anything else.',
  },
];

export const STATUS_DONE = [
  'Python tracing, in-browser, with a runaway-loop watchdog',
  'C++ and Java tracing via the local service',
  'All ten structure views with diff-driven animation',
  'Verdicts, divergence seeking, scrubbing without re-execution',
  'LeetCode capture extension',
  'Accounts, run history, AI captions',
];

export const STATUS_TODO = [
  'A production sandbox for the trace service',
  'Graph and adjacency-list visualisation',
  'A Claude option beside the Gemini explainer',
  'Hosted C++ / Java (today the service is local)',
];
