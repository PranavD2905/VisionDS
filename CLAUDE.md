# VisionDS — CLAUDE.md

## What this project is

VisionDS is a DSA-learning tool for students: paste a Python solution and its
testcases (LeetCode style), watch a fluid animated dry-run of *your own code*,
and jump to the exact step where it produces the wrong answer or throws. A
browser extension that captures code + problem + testcases directly from
LeetCode and hands off to this site is the planned next layer (not built yet).

History note: the project was restarted from scratch on 2026-07-19. Any
reference to an earlier VisionDS build (NestJS services, gateway, session
service) is obsolete — this monorepo is the only implementation.

## Core principles (do not violate)

1. **The trace is ground truth.** The animation replays a real execution
   recorded by a tracer. No LLM ever generates or alters steps; AI text only
   decorates the trace, and annotations pointing at nonexistent steps are
   dropped (`sanitize` in packages/explainer).
2. **`ExecutionTrace` is the locked contract.** Everything downstream of a
   runner (UI, explainer, future extension) speaks the Zod schema in
   `packages/trace-schema/src/schema.ts`. Extend it additively only.
3. **Language-agnostic by design.** Python-only today, but the `Runner`
   interface (`packages/runners/src/types.ts`) is the seam: adding C++/Java
   later means one new server-side runner, zero changes to schema or UI.
4. **Fluid, modern animation is a product requirement.** Framer Motion
   springs (interruptible, scrub-safe), shared `layoutId` gliding for pointer
   chips, diff-driven choreography between steps, transform/opacity only,
   `prefers-reduced-motion` respected. "Basic" motion is a regression.
5. **Student code never leaves the browser.** Execution is client-side
   (Pyodide/WASM). The only network call is the optional Gemini explain
   request, using the student's own API key from localStorage.

## Architecture

pnpm workspaces monorepo:

- `packages/trace-schema` — THE CONTRACT. Zod schemas + TS types
  (`ExecutionTrace`, `TraceStep`, `VarSnapshot`, `TestCaseResult` with
  `divergenceStepIndex`); hard caps in `caps.ts` (10k steps, 5s wall clock,
  100 collection items, 200-char strings, depth 3 — injected into the Python
  tracer so all runners share them); `analyze.ts` `inferPointerRoles()` tags
  integer locals that stay in-bounds of an array as pointer chips;
  `fixtures/twoSumFail.ts` canned trace for UI work without a runner.
- `packages/runners` — `Runner` interface + `PyodideRunner`. A Web Worker
  boots Pyodide (assets served locally from `/pyodide/` via
  vite-plugin-static-copy, not CDN) and runs student code under
  `harness.py`'s `sys.settrace` tracer: LeetCode-style input parsing (one
  arg per line, `name = literal` accepted; entry point = last top-level def,
  else last public method of `class Solution`), capped locals snapshots,
  stdout capture, verdict + divergence detection. A JS-side watchdog
  (cap + 10s) terminates the worker for loops Python can't interrupt →
  clean `timeout` verdict, never a frozen tab. One run in flight at a time;
  `AbortSignal` supported.
- `packages/explainer` — optional AI layer. Provider-agnostic `Explainer`
  interface; `GeminiExplainer` (default `gemini-2.5-flash`) sends code + a
  compact trace digest, gets `{summary, annotations[{stepIndex, text}]}`;
  sanitization drops out-of-range stepIndexes. API key: user-supplied,
  localStorage only. A Claude explainer can plug in beside it.
- `apps/web` — React + Vite + TS. `PastePage` (CodeMirror 6, testcase rows,
  pre-filled buggy two-sum) → `RunPage`: CodePanel (current-line highlight),
  Stage + `stage/views.tsx` (animated arrays/dicts/scalars, pointer chips),
  Transport (play/pause/speed/step/scrub — scrubbing renders `steps[cursor]`,
  no re-execution), VerdictBanner ("Jump to failing step" seeks to
  `divergenceStepIndex`), ExplainPanel. State: Zustand store (`store.ts`) —
  immutable traces + a cursor; the cursor is the only thing playback mutates.

## Commands

```sh
pnpm install
pnpm dev        # web app on http://localhost:5173
pnpm test       # vitest: schema + explainer + Node-side Pyodide tracer suite
pnpm typecheck  # tsc --noEmit across all packages
pnpm build      # production build
```

## Status (2026-07-19)

- Done & verified: monorepo, trace-schema + caps + pointer inference,
  PyodideRunner + harness + watchdog, web visualizer, Gemini explainer.
  All tests pass; typecheck + prod build clean.
- Not yet reviewed: animation quality against the "fluid, not basic" bar —
  needs a live run + screenshots.
- Known minor: main JS chunk ~920 kB (code-split when convenient).
- Not built yet: browser extension (LeetCode capture → handoff), server-side
  runner for C++/Java, Claude explainer option.

## Repo conventions

- Branch `visionds-mvp` holds the MVP; remote is
  github.com/PranavD2905/VisionDS.
- Tests live next to sources (`*.test.ts`, vitest). The Pyodide harness is
  tested from Node in `harness.test.ts`.
- Caps changes go in `packages/trace-schema/src/caps.ts` only — the Python
  side receives them at run time; never hard-code limits elsewhere.
