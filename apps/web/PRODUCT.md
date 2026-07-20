# Product

## Register

product

## Platform

web

## Users

Students working through LeetCode-style data-structures-and-algorithms problems, usually mid-grind and under time pressure. Their context is a laptop with the browser open, iterating on a Python solution that fails a test case for reasons they can't see by re-reading the code. The job to be done is to pinpoint the exact step where their own solution breaks and understand the failure without tracing execution in their head line by line. Everything runs locally in the browser sandbox, so the surface speaks to one primary user — the student debugging their own attempt. A browser extension that captures code and testcases directly from LeetCode is a planned next layer, not a second audience today.

## Product Purpose

VisionDS turns a student's own Python solution into a smooth, animated dry-run of its execution: they paste code and testcases, hit run, and scrub through every step of what actually happened, jumping straight to the step where it fails. It runs entirely in the visitor's browser via Pyodide (WASM Python), so nothing is sent to a server. It exists because the hardest part of DSA practice isn't writing the code, it's seeing why *your specific attempt* breaks. Success looks like a student moving from "it fails and I don't know why" to standing on the exact failing step in seconds.

## Positioning

VisionDS animates the real execution of *your* code — not a generic textbook algorithm — and drops you on the precise step where it fails.

## Brand Personality

Clear, honest, grounded. The recorded trace is ground truth, and the interface's job is to state the truth of the code plainly, without hype or decoration that competes with it — even the optional AI layer only annotates the trace and is discarded when it points at steps that don't exist. The voice is calm, exact, and developer-native. The feel to aim for is sharp precision: a pro-grade debugger a stressed student trusts under pressure, closest in spirit to Raycast — precise, dense-but-calm, monospace-friendly, dark and focused.

## Anti-references

Not a heavy enterprise dashboard: no gray-on-gray corporate density, cold chart clutter, or panels that read as an admin console. Not generic AI SaaS: no gradient hero, glassmorphism, identical feature-card grids, or default purple-blue everything. Not a cluttered IDE or debugger sprawl: no wall of panels, tiny controls, or everything-at-once tool surface that overwhelms the one thing the student came to see.

## Design Principles

The trace is ground truth. The UI presents what actually executed; annotations and AI captions decorate it and are dropped when they contradict it — they never override the recorded steps.

Fastest path to the failure. Every screen optimizes for reaching the exact failing step, not for exploring everything the run produced. "Jump to failing step" is the spine, not a feature.

Your code, not a textbook. The value is animating the student's real, specific execution; specificity is the whole point, so never dilute it toward a generic algorithm illustration.

Calm under pressure. The user is time-boxed and already stressed by the problem. Reduce noise, hold density where it helps and strip it where it doesn't; never add visual pressure.

Familiar debugger vocabulary. Reuse affordances developers already trust — scrubber, step controls, current-line highlight — rather than inventing new ones for flavor.

## Accessibility & Inclusion

WCAG AA contrast is a hard floor for all text and UI. Playback, the scrubber, and step navigation are fully keyboard-operable. Status meaning — pass, fail, and current step — carries shape or label, not color alone, so red/green colorblind users read state reliably. As a standing baseline for an animated product, the trace animation always has an instant, non-animated alternative under `prefers-reduced-motion`.
