# VisionDS

Paste your Python DSA solution and its testcases, watch a smooth animated
dry-run of *your own code*, and jump straight to the exact step where it
fails. Built for students grinding LeetCode-style problems; a browser
extension that captures code + testcases directly from LeetCode is the
planned next layer on top of this app.

## Quick start

```sh
pnpm install
pnpm dev        # web app on http://localhost:5173
pnpm test       # schema tests + Node-side Pyodide tracer suite
pnpm typecheck
pnpm build
```

Try it: the editor is pre-filled with a buggy two-sum. Hit **Run &
visualize**, then **Jump to failing step**.

## How it works

```
apps/web            React + Vite visualizer (paste → run → animated stage)
packages/trace-schema   THE CONTRACT: language-agnostic ExecutionTrace format
                        (Zod schemas, hard caps, pointer-role inference)
packages/runners    Runner interface + PyodideRunner: a Web Worker boots
                    Pyodide (WASM Python, served locally from /pyodide/) and
                    runs the student's code under a sys.settrace tracer that
                    records every step with capped locals snapshots
```

Everything downstream of a runner speaks the `ExecutionTrace` format, so
adding C++/Java support later means implementing one server-side `Runner` —
no changes to the trace format or the UI. Hard caps (10k steps, 5s wall
clock, capped snapshot sizes, plus a worker-terminating watchdog) mean an
infinite loop ends as a clean "trace truncated" verdict, never a frozen tab.

Student code runs entirely in the visitor's own browser sandbox; nothing is
sent to a server.

## AI explanations (optional)

On the run page, **✨ Explain this run** sends the code and a compact trace
digest to Gemini and renders a failure summary plus subtitle-style captions
that follow the scrubber. It needs a Gemini API key (free at
aistudio.google.com) which is stored only in your browser's localStorage and
sent only to Google — never bundled or logged. The trace stays ground truth:
AI text only decorates it, and annotations pointing at nonexistent steps are
dropped. `packages/explainer` defines the provider-agnostic `Explainer`
interface, so other models can plug in beside `GeminiExplainer`.
