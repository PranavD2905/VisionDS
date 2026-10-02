# 1. The call site, not the picker, decides the entry point

Date: 2026-10-02 · Status: accepted

## Context

A submission may contain several candidates (helpers, or more than one
problem's solution). The workbench let the student pick an entry point *and*
edit the call site (system code) that invokes it, and sent both to the runner.
The two could disagree: hand-edit the call site to call another function and
C++/Java still set their breakpoint and typed the arguments from the stale
pick, producing zero-step traces or misleading compile errors, while Python
ignored the pick and ran the text. The pick was also not persisted, so a
refresh or a debounced rescan silently reverted it.

## Decision

The call site text is the single source of truth. Every runner derives the
entry point by resolving the one candidate the call site calls, using the
shared entry-point policy. A call site that calls no candidate, an unknown
function, or more than one candidate is a user error (an `error` verdict).
Overloads resolve by the testcase's argument count. Choosing an entry in the
picker only rewrites the call site. The trace echoes the derived entry; no
client sends one.

## Consequences

- Persisting the call site text is enough to persist the student's choice.
- No runner can trace a different function from the one on screen.
- The picker becomes a convenience that writes text, never independent state.
- Rejected: storing the picked entry as truth with a read-only generated call
  site — it removes the student's ability to shape the call, and keeps two
  representations that must be synchronised.
