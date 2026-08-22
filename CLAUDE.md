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
  `callTree.ts` `buildCallTree()` derives the frame tree from a finished
  trace (real `call`/`return` events where a runner emits them, `callDepth`
  transitions where it only emits `line`) and reports which functions were
  observed calling themselves — mutual recursion included; every step now
  carries an optional `func` name for it;
  `fixtures/twoSumFail.ts` canned trace for UI work without a runner.
- `packages/runners` — `Runner` interface + two implementations.
  `PyodideRunner`: a Web Worker boots Pyodide (assets served locally from
  `/pyodide/` via vite-plugin-static-copy, not CDN) and runs student code
  under `harness.py`'s `sys.settrace` tracer: LeetCode-style input parsing
  (one arg per line, `name = literal` accepted; entry point = last top-level
  def, else last public method of `class Solution`), capped locals snapshots,
  stdout capture, verdict + divergence detection. Node-shaped objects are
  **duck-typed, never name-matched** — `val`+`left`+`right` → `tree`,
  `val`+`next` → `linkedlist` — so a student's own class name works; the walks
  are identity-tracked (a cyclic list reports `cyclesTo`) and item-capped.
  A JS-side watchdog
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

  **Brand mark**: `apps/web/public/logo.svg` — the olive iris/gem mark, used as
  the favicon and beside the wordmark in the nav, workbench bar, footer and the
  empty stage. It is a traced-raster source (711 paths): the supplied file was
  processed to strip its opaque `#FCFDFB` background (it rendered as a white
  box on dark), crop the viewBox to the mark's measured bounding box, and round
  coordinates to 2dp — 408 KB → 264 KB (88 KB gzipped). Re-processing a new
  export means redoing those three steps; it is not hand-authored SVG.

  **Two themes ship**: `specimen` (dark, default) and `daylight` (light),
  selected by `<html data-theme>`. An inline script in `index.html` stamps it
  before first paint from localStorage, else the OS preference — without that
  the page paints dark then flips. `ThemeToggle` + `theme/useTheme.ts` switch
  it with a **View Transition**: the browser snapshots the page, the theme
  swaps, and the new snapshot is clipped by a circle growing from the button to
  the furthest corner. `transition.ready` **must** have a rejection handler —
  it rejects whenever the browser skips the transition (hidden tab, a second
  toggle mid-flight) and the theme still applies via `finished`. Unsupported
  browsers and `prefers-reduced-motion` get an instant swap.

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

  Anything that *caches* a resolved token must key that cache by theme —
  `editorTheme(theme)` and the change-flash in `stage/views.tsx` both do, or
  they keep the palette they were born with after a switch.

  Consumers (`styles.css`, `site.css`, every component) reference semantic
  tokens only. A literal outside `palette.css` is a defect — it survives
  rethemes. `editorTheme(theme)` is a lazy per-theme factory (tokens only
  resolve once the stylesheet is in the document); pair it with
  `theme="none"`.

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
  owning only the source state. That state is mirrored to localStorage by
  `workbench/draft.ts` and restored as the initial state, so a refresh keeps
  the student's code, testcases, language and system-code strip instead of
  resetting to the two-sum starter; `#import=`, history re-open and extension
  captures still win, since they `load()` from effects that run after initial
  state is set. `readDraft` never throws — blocked storage, corrupt JSON, an
  empty draft or an unknown language id all fall back to the starter.
  There is **one copy of your code on screen**:
  the editor stays editable and marks the current step in place via
  `editorActiveLine.ts` (a CodeMirror decoration, so it tracks real line
  geometry). Editing after a run shows a "stale" note rather than pretending
  the diagram still matches.
  Either source region can also be **collapsed** from VS-Code-style toggles in
  the app bar beside the theme switch (`components/PaneToggles.tsx`): the icon
  is a miniature of the window with a band where that region actually sits
  (code = the left column, testcases = the bottom strip — VS Code's side-bar
  and panel icons), solid when showing. Collapsing the code takes the entry
  picker and the system-code strip with it: both are code UI, and leaving a
  second CodeMirror on screen made "hide the code" look broken. Collapsing one gives
  the pane to the other and drops the drag handle (no boundary left to move);
  collapsing both unmounts the source pane entirely so the stage takes the
  whole window, and **Run moves into the app bar** — hiding the editor must
  never cost the ability to run (⌘/Ctrl+Enter works either way, being a
  window listener). The flags live in
  `layout.ts` beside the split fractions, and only an explicit `false`
  collapses — a missing flag must never hide a region nobody chose to hide.
  Both splits are **drag-resizable** (`components/Splitter.tsx`, a
  pointer-capture `separator` that is also arrow-key operable and
  double-click-centres): source↔stage and, inside the source pane,
  editor↔testcases. Positions are stored as *fractions* — so proportions
  survive a window resize — driven into CSS as `--split` / `--editor-split`
  grid tracks and persisted by `workbench/layout.ts`. The stage measures
  itself (`stage/StageSize.tsx`, ResizeObserver) and publishes its box through
  context; `Maybe3D`'s `fitSpec` clamps every scene's *preferred* size to the
  room actually available, shrinking to fit and growing into spare space up to
  1.5× (unbounded growth would let one structure swallow a stage holding
  several). Two layout rules matter: the editor must take a *definite* height
  from its parent — the grid row supplies it now — since a percentage height
  inside an auto-height scroll parent puts CodeMirror's measure cycle into an
  infinite loop that hangs the tab; and each pane scrolls internally so the
  page never does.
  Marketing pages share `components/site/SiteChrome.tsx` (nav + footer) and
  `Reveal.tsx` (IntersectionObserver scroll reveal); marketing CSS is
  `src/site.css`, which also defines the `.frame` the workbench reuses.
  The extension still hands off at `/#import=…`; `LandingPage` forwards that
  fragment to `/app` untouched (on mount *and* on `hashchange`, since a
  hash-only change is a same-document navigation), so installed builds keep
  working.
  Shared playback components live in `src/components/`: Stage +
  `stage/views.tsx` (animated arrays/dicts/scalars, pointer chips), Transport.
  **Every structure kind has a 3D scene** (`stage/three/`, react-three-fiber),
  one metaphor per kind: array/string = block rail (height encodes numeric
  value, uniform tiles otherwise; swap arcs on two lanes so passing blocks
  miss each other), matrix = height-field terrain (DP tables assemble as a
  diagonal wave), stack = tower (pushes drop in from above, `top` tag rides
  the summit), queue = conveyor (enter rear, whole line glides forward on
  dequeue), dict = keyed landing pads (value block drops onto its key's pad),
  set = honeycomb of hex gems (membership, not order), linked list = chain
  with arrow struts (+ arced cycle tube), tree = hanging mobile of orbs.
  Scalars stay 2D.
  **The recursion tree is the one deliberately flat view.** When
  `buildCallTree` finds recursion, the stage header grows a
  Structures/Recursion tree toggle; `components/CallTreeView.tsx` draws one
  **oval** per call the program actually made, joined by **downward arrows**
  from caller to callee — 2D on purpose, since a call tree is about shape and
  order and reads faster without perspective. A node says only what the call
  *was* (`fib(3)` — name plus that call's args, never the function body), with
  the returned value added as a small second line once it comes back; the
  ellipse widens to fit its label, so short calls read as circles. Arrowheads
  are per-state SVG markers because a marker cannot inherit its line's stroke. It does not
  arrive finished: `stage/callTreeLayout.ts` lays out the *whole* run once (so
  positions never shift under already-drawn nodes), then a frame is revealed
  at the step it was entered and fills in `→ value` at the step it returned,
  so the tree draws and unwinds itself as the transport plays or scrubs.
  Same purity rule as the 3D scenes: the render is a function of the cursor
  alone, which is also what lets clicking a node open a detail popover beside
  it answering *for the step on screen*: the full unclipped `f(name=value, …)`
  and either the returned value or "not yet — still on the stack", plus an
  explicit jump-to-this-call button (click selects rather than seeks, or the
  seek would move the cursor and invalidate the question). It dismisses on any
  pointerdown outside it, on Escape, and when scrubbing back past the call
  un-draws its node. The live frame auto-pans into view. Capped at
  `MAX_CALL_NODES`.
  Layout: `three/kit.tsx` is the shared machinery (canvas
  rig, damp helpers, `Block3D`, labels, chips, plinth, theme colors);
  `linear/field/keyed/graph.tsx` hold the scenes; `three/Stage3D.tsx` is the
  kind→scene registry and the single lazy entry — three.js lives in one
  ~239 kB gz chunk that never loads until an eligible structure is on stage.
  Gating lives in views.tsx (`Maybe3D` + per-kind size/scalar caps, WebGL, no
  `prefers-reduced-motion`), each 2D view remaining the error/ineligible
  fallback (the Suspense fallback is an empty stage-sized box: flashing the
  2D view while the chunk loads read as a glitch). Motion model: every
  animated quantity (position, height, color, flash, lift) is
  `MathUtils.damp`ed toward a target that is a pure function of
  `steps[cursor]`, so every scene is scrub-safe by construction and needs no
  keyframes — the swap/hop arc is lift ∝ distance still to travel. Colors
  resolve through `token()` only, re-resolved via a MutationObserver on
  `<html data-theme>` (the memo is keyed by theme, per the caching rule);
  element identity comes from `stage/slotIds.ts` (arrays, both rails) and
  the QueueView offset trick (queues); `stage/treeLayout.ts` is the shared
  2D/3D tree layout.
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
- Done & verified (2026-07-25): **light mode (`daylight`) + circular wipe** —
  a second semantic mapping block, no consumer changes. Light-mode `--accent`
  darkens to deep chartreuse so it stays legible as ink, and `--text-inverse`
  flips to white so it still reads on an accent fill. Verified light mode on
  landing and workbench incl. a live run. **The wipe itself could not be seen
  under automation**: the driven tab reports `document.hidden`, and Chrome
  aborts view transitions in hidden tabs by design — that is how the missing
  rejection handler was found.
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
- Done & verified (2026-07-25): **3D array stage** on branch
  `visionds-3d-stage` — react-three-fiber block scene for numeric arrays (see
  apps/web notes above). Verified in the browser on a live bubble-sort run:
  entrance rise, mid-run order after pass one, pointer chips + acid tint on
  `i`/`p`, sorted staircase at the last step, and a live theme flip re-skinning
  the whole scene (paper blocks / olive accent / visible shadows). Caveat
  repeated from the wipe work: **the automated tab throttles
  requestAnimationFrame** (window occluded), so animation smoothness cannot be
  observed under automation — only settled states were verified; play it in a
  real tab to judge motion. Typecheck, prod build and all unit tests pass.
- Done (2026-07-31): **3D scenes for every structure kind** on
  `visionds-3d-stage` (see apps/web notes). Browser-verified on live Python
  runs: array rail (+ pointer chips, ghost slots, pointed tint), stack tower
  (drop-in push, `top` tag), queue conveyor (rear entry, forward glide on
  dequeue, ← out/in ← floor marks), dict pads (height-coded values, key
  labels), set honeycomb gems, and both matrices of a Min Path Sum run
  (height-field filling in). Same automation caveat as before: rAF is
  throttled in the driven window, so only settled states were verified.
- Done & verified (2026-08-06): **Python tracer emits `tree`/`linkedlist`
  kinds**, which is what the chain and mobile scenes were waiting on — before
  this, node objects fell through to `repr` and showed as
  `<__main__.TreeNode object at 0x…>` on stage. Browser-verified: a BST-insert
  run draws the mobile (root 5 over 3/8 over 1/4), and a list reversal draws
  three chains mid-flight (`prev` 3→2→1 reversed, `curr` 4→5 remaining,
  `head` 1→∅). 3 new harness tests cover chain, cycle (`cyclesTo`), and tree.
  Note for dev: editing `harness.py` needs a **dev-server restart**, not just
  HMR — the worker keeps the old `?raw` import and the run dies with
  "worker crashed".
- Done & verified (2026-08-22): **recursion tree** — derived call tree in
  trace-schema (`callTree.ts`), `func` recorded by all three tracers (Python
  `co_name`, lldb's name trimmed to the bare function, JDI's
  `method().name()`), and a 2D self-drawing tree view behind a stage toggle
  that only appears when recursion is actually detected. 7 builder unit tests
  plus 2 end-to-end Pyodide tests (a live `fib(4)` trace builds the expected
  9-node tree with correct nesting and return values; two-sum reports no
  recursion). Typecheck, prod build and all 60 tests pass. **Not yet exercised
  in a real browser** — the Chrome extension was not connected this session,
  so the reveal choreography and auto-pan are visually unverified.
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
