import type { SpecimenSpec } from '../types';

/**
 * The landing catalogue. Content only — no JSX and no layout decisions, so the
 * copy can change without touching a component, and the same entries could
 * drive a different presentation entirely.
 */
export const LANDING_SPECIMENS: SpecimenSpec[] = [
  {
    id: 'array-scan',
    index: '001',
    kind: 'S',
    title: 'Array & pointers',
    tag: { label: 'Pointers', glyph: '↕' },
    demo: 'array-scan',
    span: 2,
    status: 'live',
    note: 'Integers that stay in bounds of an array are inferred as pointers and ride above the cells, gliding between slots instead of blinking.',
  },
  {
    id: 'stack',
    index: '002',
    kind: 'S',
    title: 'Stack',
    tag: { label: 'Behaviour', glyph: '⇅' },
    demo: 'stack',
    status: 'live',
    note: 'Push/pop patterns are detected from the trace, then drawn as a pile with a marker on top.',
  },
  {
    id: 'map',
    index: '003',
    kind: 'S',
    title: 'Hash map',
    tag: { label: 'Structure', glyph: '⌗' },
    demo: 'map',
    status: 'live',
    note: 'Keys and values as rows joined by drawn arrows — insertion order preserved as the run made it.',
  },
  {
    id: 'list-walk',
    index: '004',
    kind: 'S',
    title: 'Linked list',
    tag: { label: 'Traversal', glyph: '→' },
    demo: 'list-walk',
    status: 'live',
    note: 'Nodes chained by arrows, ending in null — or a cycle note when your pointers never terminate.',
  },
  {
    id: 'divergence',
    index: '005',
    kind: 'V',
    title: 'Jump to the failing step',
    tag: { label: 'Verdict', glyph: '⚑' },
    demo: 'divergence',
    status: 'live',
    note: 'Verdicts carry a step index, so finding where your answer went wrong is a seek, not a search.',
  },
  {
    id: 'trace-tape',
    index: '006',
    kind: 'R',
    title: 'The recording',
    tag: { label: 'Ground truth', glyph: '●' },
    demo: 'trace-tape',
    span: 3,
    status: 'live',
    note: 'Every frame above is replayed from a real execution recorded by a tracer. No model writes a step.',
  },
];

/** How a run gets from your editor to the stage. */
export const PIPELINE_STEPS = [
  {
    n: '01',
    title: 'Paste, or capture',
    body: 'Drop in a LeetCode-style solution and its testcases — or let the browser extension lift the code, the problem and the examples straight off the page.',
  },
  {
    n: '02',
    title: 'It actually executes',
    body: 'Python runs in your browser under a real tracer. C++ and Java compile and step under lldb and JDI. Every line, every local, recorded as a step.',
  },
  {
    n: '03',
    title: 'Watch it, then jump',
    body: 'Scrub the recording like video. When a case fails, one button seeks to the exact step where your run diverged from the expected answer.',
  },
];

export const LANGUAGE_ROWS = [
  { name: 'Python', where: 'Your browser', tracer: 'sys.settrace under Pyodide', state: 'live' },
  { name: 'C++', where: 'Trace service', tracer: 'clang++ -g, stepped by lldb', state: 'live' },
  { name: 'Java', where: 'Trace service', tracer: 'javac -g, stepped by JDI', state: 'live' },
  { name: 'JavaScript', where: '—', tracer: 'one adapter away', state: 'planned' },
];
