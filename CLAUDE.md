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
3. **Language-agnostic by design.** The `Runner` interface
   (`packages/runners/src/types.ts`) is the seam. Python runs in-browser
   (`PyodideRunner`); compiled languages run on the server-side trace service
   (`ServerRunner` → `packages/trace-service`). Adding a language = one new
   runner/adapter, zero changes to schema or UI.
4. **Fluid, modern animation is a product requirement.** Framer Motion
   springs (interruptible, scrub-safe), shared `layoutId` gliding for pointer
   chips, diff-driven choreography between steps, transform/opacity only,
   `prefers-reduced-motion` respected. "Basic" motion is a regression.
5. **Client-side by default; server only when a language needs it.** Python
   executes entirely in the browser (Pyodide/WASM) — nothing leaves the
   machine. Compiled languages (C++ today, Java next) have no in-browser
   tracer, so they route to the local trace service, which compiles and steps
   them under a debugger. That service runs student code and MUST be sandboxed
   in production (container, no network, cpu/mem/pid limits, ephemeral fs).
   The optional Gemini explain call still uses the student's own key.

## Architecture

pnpm workspaces monorepo:

- `packages/trace-schema` — THE CONTRACT. Zod schemas + TS types
  (`ExecutionTrace`, `TraceStep`, `VarSnapshot`, `TestCaseResult` with
  `divergenceStepIndex`); hard caps in `caps.ts` (10k steps, 5s wall clock,
  100 collection items, 200-char strings, depth 3 — injected into the Python
  tracer so all runners share them); `analyze.ts` `inferPointerRoles()` tags
  integer locals that stay in-bounds of an array as pointer chips;
  `fixtures/twoSumFail.ts` canned trace for UI work without a runner.
- `packages/runners` — `Runner` interface + two implementations.
  `PyodideRunner`: a Web Worker boots Pyodide (assets served locally from
  `/pyodide/` via vite-plugin-static-copy, not CDN) and runs student code
  under `harness.py`'s `sys.settrace` tracer: LeetCode-style input parsing
  (one arg per line, `name = literal` accepted; entry point = last top-level
  def, else last public method of `class Solution`), capped locals snapshots,
  stdout capture, verdict + divergence detection. A JS-side watchdog
  (cap + 10s) terminates the worker for loops Python can't interrupt →
  clean `timeout` verdict, never a frozen tab. `ServerRunner`: POSTs
  `{language, code, testCase}` to the trace service and schema-validates the
  reply — same contract, different transport. `AbortSignal` supported.
- `packages/trace-service` — Node/TS server (run with `tsx`) that traces
  compiled languages under a debugger, emitting the identical
  `ExecutionTrace`. `POST /trace`. Pluggable `LanguageAdapter` seam: each
  adapter compiles a harness + returns a `StepperCommand` the generalized
  runner spawns (`trace.ts`). Shared caps (`caps.ts`), entry-point rule, and
  LeetCode input parsing. **C++** (`adapters/cpp`): one translation unit
  (prelude + student code at known lines + a `main` building typed args and
  JSON-serializing the result via a sentinel), compiled `clang++ -g`, stepped
  by `stepper/lldb_stepper.py` (the `sys.settrace` analog) which reads locals
  as structured kind-tagged values (`vector`→array, `unordered_map`→dict,
  stack/queue via the underlying container, ListNode/TreeNode→linkedlist/tree),
  hides pre-declaration garbage, climbs out of STL frames. **Java**
  (`adapters/java`): writes Solution.java (imports + student) + Main.java (arg
  building + result serialization + ListNode/TreeNode defs), compiles `javac
  -g`, stepped by `stepper/VisionDsTracer.java` — a JDI debugger program (the
  Java analog) that class-exclusion-filters to the student's code and reads
  primitives/String/arrays/List/HashMap/HashSet/ListNode/TreeNode. Needs a JDK
  (auto-detected, or `VISIONDS_JAVA_HOME`). Runs student code → sandbox before
  any non-local deployment.
- `packages/explainer` — optional AI layer. Provider-agnostic `Explainer`
  interface; `GeminiExplainer` (default `gemini-2.5-flash`) sends code + a
  compact trace digest, gets `{summary, annotations[{stepIndex, text}]}`;
  sanitization drops out-of-range stepIndexes. API key: user-supplied,
  localStorage only. A Claude explainer can plug in beside it.
- `packages/auth` — `@visionds/auth`, the shared, environment-agnostic Supabase
  wrapper (used by web and extension). `createAuthClient`/`isConfigured`/
  `configFromEnv` (graceful no-op when unconfigured), auth helpers
  (`signUp`/`signInWithPassword`/`signInWithGoogle`/`signOut`/`onAuthChange`),
  and RLS-guarded data access (`saveRun`/`listRuns`, `pushCapture`/
  `pullCaptures`/`consumeCapture`, `getProfile`/`incrementExplainCount`). Row
  types mirror `supabase/migrations/*.sql`. The whole thing takes config *in* —
  it never reads `import.meta.env`/`process.env` — so both surfaces reuse it.
- `supabase/` — schema version control. `migrations/*.sql` (timestamped,
  append-only) hold the `runs`/`captures`/`profiles` tables, **RLS policies**
  (the authorization layer — `user_id = auth.uid()`, so clients talk to Postgres
  directly with no API tier), a profile auto-create trigger, and the
  `increment_explain_count` RPC. `config.toml` for `supabase start` local dev.
- `apps/extension` — Manifest V3 Chrome extension. **Now has a small esbuild step**
  (`build.mjs` → `dist/`) so the popup imports `@visionds/auth`; Supabase config
  is injected via build-time `define` (auth-free when unset). Optional Google
  sign-in via `chrome.identity.launchWebAuthFlow` (PKCE, session in
  `chrome.storage`); signed in, **Open in VisionDS** pushes a `captures` row the
  web app pulls, else the URL-hash handoff is the fallback. On a LeetCode problem
  page its popup runs an extractor
  in the page's MAIN world (`chrome.scripting.executeScript`) to read the Monaco
  editor code, the selected language (`global_lang` → python/cpp/java), the
  problem title/slug, and example testcases parsed from the statement's
  `Input:/Output:` blocks into VisionDS's one-arg-per-line format. Everything is
  shown editable in the popup (so LeetCode DOM drift never blocks a handoff),
  then encoded as UTF-8-safe base64url into the site URL fragment
  (`/#import=…`) and opened in a new tab. The fragment never leaves the browser.
- `apps/web` — React + Vite + TS. **Design system: "SPECIMEN"** — a catalogue
  of live modules on near-pure black, in the spirit of a component library's
  own site. Every region of every page is a framed specimen: hairline
  white-alpha border, 4–6px radius, a stamped tag top-left, and a tabular
  footer that indexes it (`KIND │ NNN │ TITLE │ STATUS`). Acid `--accent` marks
  live state; mint/red carry verdicts. All type is monospace (IBM Plex Mono),
  with Silkscreen for stamped micro-labels. Flat — no overlay between viewer
  and data.

  **The theme is layered, and the layering is load-bearing:**
  1. `src/theme/palette.css` — primitives (`--acid-500`, `--white-a10`). **The
     only file in the app allowed to contain a literal color.**
  2. `src/theme/semantic.css` — role tokens (`--accent`, `--panel`,
     `--verdict`-style names, `--editor-*`) mapped onto primitives. This is
     the contract every consumer depends on; a new theme is a new mapping
     block (there is a `[data-theme]` hook), with zero consumer edits.
  3. `src/theme/tokens.ts` — the JS seam. CodeMirror compiles its own
     stylesheet and Framer Motion needs concrete interpolable colors, so both
     resolve *the same semantic tokens* through `token()` / `tokenAlpha()`
     instead of hard-coding. `tokenAlpha` returns `rgba()` on purpose: custom
     properties compute to an unresolved token stream, so a `color-mix()`
     string reaches Framer Motion uninterpolable and the animation snaps.

  Consumers (`styles.css`, `site.css`, every component) reference semantic
  tokens only. A literal outside `palette.css` is a defect — it survives
  rethemes. `editorTheme()` is a lazy memoized factory (tokens only resolve
  once the stylesheet is in the document); pair it with `theme="none"`.

  **Site structure** (`src/site/`) is composed, not monolithic:
  `types.ts` (the `SpecimenSpec`/`DemoComponent` contracts), `Specimen.tsx`
  (the frame — knows how to index and caption, never what it contains),
  `demos/*` (one self-contained CSS-animated exhibit per file, none aware of
  the frame), `demos/registry.ts` (id → component, so the frame never branches
  on which demo it shows), and `content/*.ts` (catalogue data, no JSX). Adding
  an exhibit = one file + one registry line; nothing that already works is
  edited. Catalogue spans must tile the 3-column grid (2+1 │ 1+1+1 │ 3) or the
  layout leaves holes.

  **Routes:** `/` `LandingPage` (masthead + the six-specimen catalogue +
  pipeline + creed + runtimes), `/product` `ProductPage` (spec sheet: pipeline
  ASCII, the contract, language matrix, structures, caps, privacy tiers,
  honest status), `/app` `WorkbenchPage`, plus the auth routes. `/run`
  redirects to `/app` — editing and visualization are **one screen**, not two.

  **The workbench** (`src/workbench/`) is a two-pane split: `SourcePane`
  (language, editor, testcases, run) and `StagePane` (verdict, diagrams,
  narration, transport), with `useRun` holding the run flow and `WorkbenchPage`
  owning only the source state. There is **one copy of your code on screen**:
  the editor stays editable and marks the current step in place via
  `editorActiveLine.ts` (a CodeMirror decoration, so it tracks real line
  geometry). Editing after a run shows a "stale" note rather than pretending
  the diagram still matches. Two layout rules matter: the editor must take a
  *definite* height from its flex parent (a percentage height inside an
  auto-height scroll parent puts CodeMirror's measure cycle into an infinite
  loop that hangs the tab), and each pane scrolls internally so the page never
  does.
  Marketing pages share `components/site/SiteChrome.tsx` (nav + footer) and
  `Reveal.tsx` (IntersectionObserver scroll reveal); marketing CSS is
  `src/site.css`, which also defines the `.frame` the workbench reuses.
  The extension still hands off at `/#import=…`; `LandingPage` forwards that
  fragment to `/app` untouched (on mount *and* on `hashchange`, since a
  hash-only change is a same-document navigation), so installed builds keep
  working.
  Shared playback components live in `src/components/`: Stage +
  `stage/views.tsx` (animated arrays/dicts/scalars, pointer chips), Transport
  (play/pause/speed/step/scrub — scrubbing renders `steps[cursor]`, no
  re-execution), VerdictBanner ("Jump to failing step" seeks to
  `divergenceStepIndex`), ExplainPanel. State: Zustand store (`store.ts`) —
  immutable traces + a cursor; the cursor is the only thing playback mutates.
  **Auth (optional, additive)** lives in `src/auth/`: `AuthProvider`/`useAuth`
  (session hydrated + kept in sync), `/login`+`/signup` (email/password + Google),
  `/auth/callback`, `/history`, and `AccountMenu`. Wired to Supabase via
  `src/auth/config.ts` (reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`); with
  those unset the app runs fully signed-out. Runs auto-save on completion;
  extension captures are pulled on load; the explainer is sign-in-gated only when
  auth is configured. Client-side-first is intact — Python still never leaves the
  browser.

## Commands

```sh
pnpm install
pnpm dev        # web app on http://localhost:5173
pnpm --filter @visionds/trace-service dev   # C++/Java trace service on :8787 (needs clang++/lldb; JDK for Java)
pnpm test       # vitest: schema + explainer + auth + Pyodide tracer + C++/Java trace-service
pnpm typecheck  # tsc --noEmit across all packages
pnpm build      # production build (web)

pnpm --filter @visionds/extension build   # esbuild the extension → apps/extension/dist/
# Auth needs a Supabase project: copy apps/web/.env.example → apps/web/.env and fill in.
# supabase db push (or paste supabase/migrations/*.sql into the SQL editor) applies the schema.
```

The web app finds the service at `VITE_TRACE_SERVICE` (default
`http://localhost:8787`); C++/Java runs need it up, Python does not.

## Status (2026-07-22)

- Done & verified: monorepo, trace-schema + caps + pointer inference,
  PyodideRunner + harness + watchdog, web visualizer (build-from-nothing
  diagrams for array/matrix/dict/set/stack/queue), Gemini explainer.
- Done & verified: server-side C++ via `trace-service` (lldb stepper) end to
  end — language selector → compile+trace → same animated stage. Unit tests,
  HTTP service, and a live browser run all pass; typecheck + prod build clean.
- Done & verified: server-side Java via `trace-service` (JDI tracer) end to
  end — language selector → javac + JDI step → same animated stage. 4 Java unit
  tests (two-sum int[]+HashMap, List return, void in-place, compile error) and
  a live browser run pass. Java coverage: primitives/String/arrays(+2D)/List/
  HashMap/HashSet/ListNode/TreeNode; value- and void-returning entries. JDK
  auto-detected from Homebrew or `VISIONDS_JAVA_HOME`.
- C++ coverage: value- and void-returning entries; vector/string/map/set/
  scalar, std::stack/queue (via the underlying container), and ListNode/
  TreeNode (built from LeetCode input, traversed by the stepper into
  linkedlist/tree kinds, rendered as chained nodes / a laid-out binary tree).
  Signature-driven arg typing (vector<char>, long long, …). Remaining gaps:
  graph/adjacency structures, exotic parameter types.
- Known minor: main JS chunk ~940 kB (code-split when convenient).
- Done: browser extension (`apps/extension`) — LeetCode capture → base64url
  hash handoff → `PastePage` hydrates via `apps/web/src/lib/import.ts` and shows
  an "Imported from LeetCode" badge. Encode/decode roundtrip (incl. unicode) and
  example-testcase parsing verified in Node; web typecheck + prod build clean.
  Not yet exercised against live LeetCode DOM in a real browser (extractor is
  best-effort with editable-in-popup fallback); no toolbar icon PNGs bundled.
- Done & verified: **accounts & auth (optional, additive)** via Supabase —
  `packages/auth` shared wrapper, `supabase/migrations` (tables + RLS + profile
  trigger + explain-count RPC), web login/signup (email + Google), account menu,
  run-history save + `/history`, sign-in-gated explainer, and the extension's
  esbuild step + Google sign-in + account capture sync. Whole workspace
  typechecks, web prod build is clean, 12 unit tests pass (incl. new
  `packages/auth` config/mapping tests), and the extension bundles (auth-free
  and with injected Supabase config). **Not yet exercised against a live Supabase
  project** — needs a project + Google OAuth client provisioned (see
  `apps/web/.env.example`); the OAuth flows and RLS are untested end-to-end.
- Done & verified (2026-07-25): **editing + visualization merged onto one
  screen** — `/app` is now a two-pane workbench, `PastePage`/`RunPage`/
  `CodePanel` are gone, and the live editor doubles as the playback code panel.
  Verified in the browser: run → verdict + diagrams, jump-to-failing-step moves
  the editor highlight, stepping updates both panes, editing shows the stale
  note, `/run` redirects.
- Done & verified (2026-07-25): **UI rehaul → SPECIMEN**, on branch
  `visionds-ui-overrides`. Layered theme (primitives → semantic → JS seam) with
  every color literal confined to `theme/palette.css`; composed `src/site/`
  catalogue (frame + demo registry + content); landing at `/`, spec sheet at
  `/product`, workbench at `/app` in the same framed-module language. Fixed en
  route: the value-flash in `stage/views.tsx` was hard-coded to the retired
  Livewire blue, and the extension's hash handoff missed same-document hash
  changes. Typecheck, prod build and all unit tests pass; landing, spec sheet,
  workbench and a live Python run verified in the browser.
- Not built yet: production sandbox for the trace service, Claude explainer
  option, graph/adjacency visualization. Known minor: bundling supabase-js grew
  the web main chunk (~940 kB → ~1.3 MB) — lazy-load the auth client to trim it.

## Repo conventions

- Branch `visionds-mvp` holds the MVP; remote is
  github.com/PranavD2905/VisionDS.
- Tests live next to sources (`*.test.ts`, vitest). The Pyodide harness is
  tested from Node in `harness.test.ts`.
- Caps changes go in `packages/trace-schema/src/caps.ts` only — the Python
  side receives them at run time; never hard-code limits elsewhere.
