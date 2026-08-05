---
name: VisionDS
description: Watch an animated dry-run of your own Python solution and jump to the step where it fails.
colors:
  livewire: "#4f8ef7"
  livewire-pulse: "#4f8ef766"
  ai-violet: "#7c5cff"
  pass-green: "#2ea36c"
  fail-red: "#e05252"
  truncate-amber: "#d9a13b"
  workbench-black: "#0e1117"
  panel-slate: "#161b26"
  inset-slate: "#1c2333"
  cell-slate: "#232c40"
  hairline: "#2a3347"
  readout-white: "#e6e9f0"
  muted-steel: "#8b93a7"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.5px"
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  data:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.livewire}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 22px"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.inset-slate}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-danger:
    backgroundColor: "{colors.panel-slate}"
    textColor: "{colors.fail-red}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    typography: "{typography.body}"
  input-field:
    backgroundColor: "{colors.inset-slate}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.md}"
    padding: "8px"
    typography: "{typography.data}"
  cell:
    backgroundColor: "{colors.cell-slate}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.md}"
    padding: "8px 6px"
    typography: "{typography.data}"
  pointer-chip:
    backgroundColor: "{colors.livewire}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "1px 7px"
  kv-chip:
    backgroundColor: "{colors.cell-slate}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
---

# Design System: VisionDS

## 1. Overview

**Creative North Star: "The Quiet Workbench"**

VisionDS is a developer's focused work surface: everything within reach, nothing shouting, and the only thing genuinely lit up is the student's own code as it runs. The interface sits back in near-black slate so the trace — the recorded truth of what actually executed — is the brightest thing on screen. A single accent, Livewire blue, does one job: it marks what is *live* right now — the current line, the active pointer riding an array, the primary action worth taking. Everything else is a quiet readout in cool neutrals.

The register is a tool, not a showpiece. Density is welcome where it helps (a code panel, an array of cells, a row of dictionary chips) and stripped everywhere it doesn't. The system is deliberately flat: there are no shadows anywhere. Depth comes entirely from four tonal slate layers stacked bg → panel → inset → cell, separated by hairline borders. This keeps the surface calm under pressure, which matters because the person using it is mid-grind on a failing LeetCode problem and does not need the UI adding to the noise.

What this system explicitly rejects: the gray-on-gray density of an **enterprise dashboard**; the gradient heroes, glassmorphism, and identical feature-card grids of **generic AI SaaS**; and the overwhelming panel-sprawl and tiny controls of a **cluttered IDE**. VisionDS shows one thing at a time, exactly, and lets the student stand on the failing step.

**Key Characteristics:**
- Flat by default — depth via four tonal slate layers and 1px hairlines, never shadows.
- One accent (Livewire) reserved for *live* state; semantic green/red/amber for verdicts only.
- Monospace for all data and code; system-ui for chrome. Never the reverse.
- Chrome is instant; only the data on the stage animates.
- Tight radii (4–10px) and pill chips; nothing rounded for decoration's sake.

## 2. Colors

A near-black slate stack lit by one functional accent, with a strict three-color semantic vocabulary for run verdicts.

### Primary
- **Livewire** (#4f8ef7): The one accent with a job. It means *this is live / look here* — the current executing line highlight, pointer chips riding an array, the primary "Run & visualize" action, the current-case selection, dictionary keys, the scrubber fill. Never decorative.
- **Livewire Pulse** (#4f8ef766): Livewire at 40% alpha, used only as the flash background of a data cell the instant its value changes. It exists to catch the eye for one step, then fades to cell slate.

### Secondary
- **AI Violet** (#7c5cff): The signature of the *optional* AI explanation layer, and only that layer — the "✨ Explain this run" badge and caption tint. Kept off the core trace so AI text always reads as decoration on top of ground truth, never as the truth itself.

### Tertiary — Semantic verdicts
- **Pass Green** (#2ea36c): A test case that passed. Verdict word, case chip, nothing else.
- **Fail Red** (#e05252): A failing case or thrown exception — the verdict word, the "Jump to failing step" action, and the exception line highlight. This is the color the whole product drives toward.
- **Truncate Amber** (#d9a13b): Soft warnings — a trace hit its step/time cap, or a value snapshot was truncated. Advisory, never alarming.

### Neutral
- **Workbench Black** (#0e1117): The page. The darkest layer; everything rests on it.
- **Panel Slate** (#161b26): Structural panels — the run header, code panel, transport bar, explain panel, case rows.
- **Inset Slate** (#1c2333): Recessed controls that sit *inside* panels — buttons, inputs, textareas, selects.
- **Cell Slate** (#232c40): The data layer — array cells, scalar tiles, key/value chips. The surface the trace's values live on.
- **Hairline** (#2a3347): Every border and divider. 1px, always. The only thing separating the tonal layers.
- **Readout White** (#e6e9f0): Primary text and data values. Cool near-white, not pure white.
- **Muted Steel** (#8b93a7): Secondary text — labels, hints, index numbers, the line-number gutter, inactive controls.

### Named Rules
**The Live-Only Rule.** Livewire is reserved for state that is *currently active* — the executing line, the live pointer, the primary action, the selected case. If an element isn't live right now, it does not get the accent. Its scarcity is what makes the current step findable at a glance.

**The Ground-Truth-Owns-Color Rule.** The recorded trace owns green/red/amber. The AI layer is granted violet and nothing else. AI text may never borrow a verdict color, because that would let a decoration impersonate ground truth.

## 3. Typography

**Display / Chrome Font:** system-ui (with -apple-system, 'Segoe UI', sans-serif)
**Data / Code Font:** ui-monospace (with 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace)

**Character:** A clean split-personality pairing. The interface chrome speaks in the native system sans — invisible, familiar, fast to read. Everything that *is data* — code lines, array cells, variable values, dictionary chips — is monospace, so numbers align in columns and code looks like code. The contrast between the two fonts is itself information: sans means "UI", mono means "your program."

### Hierarchy
- **Display** (700, 28px, -0.5px tracking): The page title on the paste screen ("VisionDS"). The only large type in the system; product UI doesn't need a hero scale.
- **Title** (600, 16px): Section headings and variable names on the stage. Quiet but definite.
- **Body** (400, 14px, line-height 1.5): Buttons, verdict detail, captions, general prose. Prose blocks cap at 65–75ch.
- **Label** (600, 13px): Field labels, hints, the "Live" badge, stage variable names. Often in Muted Steel.
- **Data** (400 mono, 14px; 13px in chips): All code and all values. The line-number gutter, code lines, cells, tiles, and key/value chips. The system's real workhorse.

### Named Rules
**The Sans-Is-Chrome, Mono-Is-Data Rule.** System sans is for the interface talking *about* the program; monospace is for the program itself. Never a display or decorative font in either slot — labels, buttons, and data all stay in these two families.

## 4. Elevation

This system uses **no shadows at all**. Depth is conveyed entirely through tonal layering: four progressively lighter slate values (Workbench Black → Panel Slate → Inset Slate → Cell Slate) stacked from page to data, each boundary drawn with a single 1px Hairline border. A control reads as "inside" a panel because it is a step lighter and ringed by a hairline, not because it floats. This keeps the surface flat, calm, and honest — nothing pretends to hover.

### Named Rules
**The No-Shadow Rule.** Shadows are forbidden. If an element needs to feel recessed or raised, move it one step along the slate ramp and give it a hairline. A `box-shadow` anywhere in this UI is a bug.

**The Hairline Rule.** Every border is exactly 1px in Hairline (#2a3347). Borders separate layers and define controls; they never thicken into a colored accent stripe. The one exception is functional, not decorative: the 3px Livewire (or Fail Red) bar on the currently-executing code line, which is a live-state marker, not a container border.

## 5. Components

Components feel **tactile and responsive**: chrome reacts instantly to input, and data on the stage springs into place. Everything is flat, tightly radiused, and hairline-bordered.

### Buttons
- **Shape:** Gently rounded, 8px radius (`{rounded.md}`). Consistent across every button.
- **Primary** (Run & visualize): Livewire fill, white text, weight 600, generous 10px 22px padding. The one filled button; it launches the core action.
- **Secondary** (default): Inset Slate fill, Readout White text, 1px Hairline, 6px 12px padding. The workhorse button.
- **Danger** (Jump to failing step): Fail Red text and Fail Red border on a Panel Slate base; hover washes the fill with ~15% Fail Red. This is the product's most important button — it earns the verdict color.
- **Ghost** (Load demo, clear key): Muted Steel text, no fill weight. Recedes.
- **Hover / Focus:** Hover shifts the border to the relevant accent (Livewire, or Fail Red for danger) — instant, no transition delay. Disabled drops to 45% opacity with a default cursor.

### Chips
- **Pointer chip:** Livewire fill, white, weight 700, 11px, 6px radius. Rides *above* the array cell its index points at, and animates between cells with a snappy spring (`layoutId`) as the pointer moves. The signature "watch the pointer walk the array" moment.
- **Key/Value & Set chips:** Pill-shaped (999px), Cell Slate fill, 1px Hairline, mono. Dictionary keys render in Livewire; values in Readout White. Enter and exit with a spring + scale, so mutations to a dict or set are visible as they happen.
- **Case chip:** Pill, colored text by verdict (green/red/amber), transparent fill; the current case gets a Livewire border and Inset Slate fill.
- **Verdict word:** Small 6px-radius pill; text in the verdict color on a 25%-tint wash of the same color (via `color-mix`). One per state: pass / fail / error / timeout.

### Inputs / Fields
- **Style:** Inset Slate fill, 1px Hairline, 8px radius, monospace 13px. Textareas resize vertically only.
- **Focus:** Border shifts toward Livewire; no glow, no shadow (per the No-Shadow Rule).
- **Import slot:** A dashed Hairline placeholder for the not-yet-built LeetCode capture — the one dashed border in the system, signalling "coming".

### Cells & Tiles (the stage)
- **Cell / scalar tile:** Cell Slate fill, 1px Hairline, 8px radius, min-width 44px, centered mono. The atomic unit of the visualizer — one array element or one scalar.
- **Change pulse:** On value change a cell re-mounts and flashes: scale 1.25 → 1 with a Livewire-Pulse background settling to Cell Slate over 0.35s. Honors `prefers-reduced-motion` (the flash is skipped, the value simply updates).
- **Index label:** Muted Steel, 11px, beneath each cell.

### Navigation & Transport
- **Run header:** Panel Slate bar, hairline underline, a Muted Steel back-link (→ Readout White on hover), the verdict banner, and case chips.
- **Transport:** Panel Slate bar pinned to the bottom. Emoji-glyph step/play controls, a full-width range scrubber with Livewire `accent-color`, a mono step counter (`n / total`), and a speed select (0.5×–4×). Fully keyboard-driven: ← / → step, space toggles play.

### The Code Panel (signature component)
The left half of the run screen. A monospace listing with a Muted Steel line-number gutter. The currently-executing line wears a Livewire highlight — an 18% Livewire wash plus a 3px Livewire left bar. When the step is an exception, the same treatment switches to Fail Red. This live line-marker is the visual anchor that ties the code to the animated stage beside it.

## 6. Do's and Don'ts

### Do:
- **Do** keep Livewire (#4f8ef7) for *live* state only — current line, active pointer, primary action, selected case. Honor the Live-Only Rule.
- **Do** convey depth with the four-layer slate ramp (#0e1117 → #161b26 → #1c2333 → #232c40) and 1px Hairline borders.
- **Do** set all code, values, cells, and chips in monospace; all chrome in system-ui.
- **Do** reserve motion for the stage data (pulses, pointer springs, chip enter/exit). Keep chrome transitions instant.
- **Do** give every semantic state a shape or label as well as a color — verdict words carry text, case chips carry glyphs — so red/green never stands alone (WCAG AA, colorblind-safe).
- **Do** give the "Jump to failing step" button the Fail Red treatment; it is the product's climax and should read as the one urgent action.
- **Do** honor `prefers-reduced-motion` on every animation, matching the cell-pulse's existing reduced-motion path.

### Don't:
- **Don't** add a `box-shadow` anywhere. Flat by default; depth is tonal. A shadow is a bug (The No-Shadow Rule).
- **Don't** thicken a border into a colored accent stripe. Borders are 1px Hairline; the only wide bar is the functional 3px live-line marker.
- **Don't** let it drift toward a **heavy enterprise dashboard** — no gray-on-gray corporate density, no chart clutter, no admin-console panels.
- **Don't** let it drift toward **generic AI SaaS** — no gradient hero, no glassmorphism, no identical feature-card grids, no default purple-blue-everywhere. (AI Violet is confined to the opt-in explain layer.)
- **Don't** let it drift toward a **cluttered IDE** — no wall of panels, no tiny controls, no everything-at-once surface. Show one thing, exactly.
- **Don't** let the AI layer borrow a verdict color. Violet is its only allowance (The Ground-Truth-Owns-Color Rule).
- **Don't** introduce a display or decorative font. Two families only: system-ui and monospace.
- **Don't** use light-gray body text on the slate surfaces for "elegance"; keep body in Readout White (#e6e9f0) so it clears AA contrast.
