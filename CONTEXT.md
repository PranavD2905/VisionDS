# VisionDS — domain glossary

Terms only. Implementation lives in CLAUDE.md and the code.

## Submissions

- **Submission** — the student's code plus the testcases they run it against.
  One submission may hold several problems' solutions and any number of
  helpers.
- **Candidate** — a function in the submission that could be run directly: a
  top-level function or a public method of `Solution`. Underscore-prefixed,
  private, and nested (closure) functions are never candidates.
- **Entry Point** — the one candidate a run calls with the testcase's
  arguments. Exactly one per run.
- **Default Entry Point** — the entry point chosen when the student has not
  chosen one: the candidate no other candidate calls; ties go to a `Solution`
  method, then the last one written.
- **Helper** — any function in the submission other than the entry point,
  whether or not it is a candidate. Helpers are traced like the entry point.
- **Call Site** (a.k.a. *system code*) — the short, student-editable driver
  that calls the entry point. It is the single source of truth for which
  function runs: the entry point is whatever candidate the call site calls.
  Choosing an entry point in the picker rewrites the call site. A call site
  calls exactly one candidate; overloads are told apart by the testcase's
  argument count.

## Runs

- **Run** — executing one entry point against one testcase, producing one
  ExecutionTrace.
- **Frame** — one activation of a function during a run. A variable's history
  belongs to a frame; the same name in two frames is two variables.
- **Helper Call** — a frame entered from another student frame. While one is
  active, the immediate caller's structures stay on stage, dimmed.
- **Alias** — one object reachable from two frames (an array passed into a
  helper). It is shown once, live in the innermost frame; the caller shows a
  link to it, never a copy.
- **User Error** — a run that cannot start because of the submission itself
  (no entry point, a call site calling zero or several candidates, an
  unparseable testcase, an argument-count mismatch). Always reported
  as an `error` verdict, never as a service failure.
