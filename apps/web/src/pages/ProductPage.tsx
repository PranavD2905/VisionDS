import { Link } from 'react-router-dom';
import { Reveal } from '../components/site/Reveal';
import { SiteFooter, SiteNav } from '../components/site/SiteChrome';

const PIPELINE = `  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
  │  CAPTURE     │      │  RUNNER      │      │  STAGE       │
  │  extension   │─────▶│  browser or  │─────▶│  animated    │
  │  or paste    │      │  trace svc   │      │  diagrams    │
  └──────────────┘      └──────┬───────┘      └──────▲───────┘
        code                   │                     │
        testcases              ▼                     │
                        ExecutionTrace ──────────────┘
                        steps[] · result · verdict
                        divergenceStepIndex`;

const CONTRACT = [
  ['steps[]', 'One entry per traced line: event, line number, locals snapshot, stdout, exception.'],
  ['result.verdict', 'pass · fail · error · timeout — decided by comparing the return value with your expected output.'],
  ['result.divergenceStepIndex', 'The step the UI seeks to when you hit "jump to failing step".'],
  ['code', 'The exact source that was executed, so the code panel highlights the real line.'],
];

const LANGUAGES = [
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

const STRUCTURES = [
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

const CAPS = [
  ['Steps recorded', '10,000', 'Long runs are truncated, not dropped.'],
  ['Wall clock', '5 seconds', 'Then the verdict is timeout.'],
  ['Collection items', '100', 'Longer collections show a truncation mark.'],
  ['String length', '200 chars', 'Kept readable on the stage.'],
  ['Nesting depth', '3', 'Deeper values are summarised.'],
];

export function ProductPage() {
  return (
    <div className="site">
      <SiteNav active="product" />

      <section className="doc-head">
        <span className="stamp">Spec sheet</span>
        <h1>
          What VisionDS actually <em>is</em>
        </h1>
        <p>
          A dry-run debugger for data-structures practice. You bring a solution and testcases; it
          produces a recorded execution and replays it as animated diagrams. This page is the honest
          version — what it traces, where your code runs, and what it does not do yet.
        </p>
        <div className="doc-meta">
          <span>
            <b>Build</b> MVP
          </span>
          <span>
            <b>Languages</b> 3
          </span>
          <span>
            <b>Updated</b> Jul 2026
          </span>
        </div>
      </section>

      {/* pipeline */}
      <section className="band" id="pipeline">
        <Reveal className="band-head">
          <span className="stamp">A / The pipeline</span>
          <h2 className="band-title">Code in, recording out.</h2>
        </Reveal>
        <Reveal className="ascii-wrap">
          <pre className="ascii">{PIPELINE}</pre>
        </Reveal>

        <div className="doc-grid">
          {CONTRACT.map(([k, v], i) => (
            <Reveal as="article" key={k} delay={i * 60} className="doc-card">
              <code className="doc-key">{k}</code>
              <p>{v}</p>
            </Reveal>
          ))}
        </div>
        <p className="doc-note">
          Everything downstream of a runner speaks this one schema. That is why the UI never learns
          a new language.
        </p>
      </section>

      {/* languages */}
      <section className="band alt" id="languages">
        <Reveal className="band-head">
          <span className="stamp">B / Language matrix</span>
          <h2 className="band-title">Where each language runs.</h2>
        </Reveal>

        <div className="lang-stack">
          {LANGUAGES.map((l, i) => (
            <Reveal as="article" key={l.name} delay={i * 80} className="lang-card">
              <header>
                <h3>{l.name}</h3>
                <span className={`pill ${l.state}`}>{l.state}</span>
                <span className="lang-where">{l.where}</span>
              </header>
              <p className="lang-how">{l.how}</p>
              <dl>
                <dt>Reads</dt>
                <dd>{l.covers}</dd>
                <dt>Note</dt>
                <dd>{l.notes}</dd>
              </dl>
            </Reveal>
          ))}
        </div>
        <p className="doc-note">
          C++ and Java need the local trace service running on port 8787. Python needs nothing at
          all.
        </p>
      </section>

      {/* what gets drawn */}
      <section className="band" id="structures">
        <Reveal className="band-head">
          <span className="stamp">C / What the stage draws</span>
          <h2 className="band-title">Ten shapes, each with its own choreography.</h2>
        </Reveal>
        <div className="struct-list">
          {STRUCTURES.map(([name, desc], i) => (
            <Reveal as="div" key={name} delay={i * 40} className="struct-item">
              <span className="struct-item-name">{name}</span>
              <span className="struct-item-desc">{desc}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* privacy */}
      <section className="band alt" id="privacy">
        <Reveal className="band-head">
          <span className="stamp">D / Where your code goes</span>
          <h2 className="band-title">Client-side by default.</h2>
        </Reveal>
        <div className="tier-grid">
          <Reveal as="article" className="tier">
            <span className="tier-n">Python</span>
            <h3>Never leaves the machine</h3>
            <p>
              Pyodide is a WebAssembly Python running inside this tab. There is no upload, no
              request, no server involved in a Python run.
            </p>
          </Reveal>
          <Reveal as="article" className="tier" delay={80}>
            <span className="tier-n">C++ / Java</span>
            <h3>Goes to the trace service</h3>
            <p>
              Compiled languages have no in-browser tracer, so the source is POSTed to the trace
              service, compiled, stepped and discarded. Today that service is one you run locally.
            </p>
          </Reveal>
          <Reveal as="article" className="tier" delay={160}>
            <span className="tier-n">AI explain</span>
            <h3>Your key, your call</h3>
            <p>
              The explainer is opt-in. It uses a key you paste, stored only in this browser, and
              sends the code plus a compact digest of the trace — never anything else.
            </p>
          </Reveal>
        </div>
      </section>

      {/* caps */}
      <section className="band" id="limits">
        <Reveal className="band-head">
          <span className="stamp">E / Limits</span>
          <h2 className="band-title">Hard caps, shared by every runner.</h2>
        </Reveal>
        <Reveal className="table-wrap">
          <table className="spec-table">
            <thead>
              <tr>
                <th>Cap</th>
                <th>Value</th>
                <th>What happens at the edge</th>
              </tr>
            </thead>
            <tbody>
              {CAPS.map(([k, v, note]) => (
                <tr key={k}>
                  <td className="cell-name">{k}</td>
                  <td className="cell-val">{v}</td>
                  <td className="cell-dim">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      {/* extension + accounts */}
      <section className="band alt" id="surfaces">
        <Reveal className="band-head">
          <span className="stamp">F / The other two surfaces</span>
          <h2 className="band-title">Extension and accounts.</h2>
        </Reveal>
        <div className="doc-grid two">
          <Reveal as="article" className="doc-card tall">
            <h3>Browser extension</h3>
            <p>
              On a LeetCode problem page, the popup reads the Monaco editor, the selected language,
              the problem title and the example testcases, and shows all of it editable before
              handoff — so a change to their markup can never block you.
            </p>
            <p>
              Signed out, it hands off through the URL fragment, which never leaves your browser.
              Signed in, it syncs through your account instead.
            </p>
          </Reveal>
          <Reveal as="article" className="doc-card tall" delay={80}>
            <h3>Accounts (optional)</h3>
            <p>
              Sign-in is additive: with it configured you get run history and extension sync;
              without it the whole app still works, signed out, with Python running exactly as
              before.
            </p>
            <p>
              Rows are guarded by row-level security in Postgres — your runs are readable only by
              you.
            </p>
          </Reveal>
        </div>
      </section>

      {/* status */}
      <section className="band" id="status">
        <Reveal className="band-head">
          <span className="stamp">G / Honest status</span>
          <h2 className="band-title">Done, and not done.</h2>
        </Reveal>
        <div className="status-cols">
          <Reveal as="div" className="status-col done">
            <h3>Working today</h3>
            <ul>
              <li>Python tracing, in-browser, with a runaway-loop watchdog</li>
              <li>C++ and Java tracing via the local service</li>
              <li>All ten structure views with diff-driven animation</li>
              <li>Verdicts, divergence seeking, scrubbing without re-execution</li>
              <li>LeetCode capture extension</li>
              <li>Accounts, run history, AI captions</li>
            </ul>
          </Reveal>
          <Reveal as="div" className="status-col todo" delay={90}>
            <h3>Not built yet</h3>
            <ul>
              <li>A production sandbox for the trace service</li>
              <li>Graph and adjacency-list visualisation</li>
              <li>A Claude option beside the Gemini explainer</li>
              <li>Hosted C++ / Java (today the service is local)</li>
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="band cta-band">
        <Reveal className="cta-box">
          <span className="stamp">Ready</span>
          <h2>Bring the solution you are stuck on.</h2>
          <p>Python needs nothing installed. It runs the moment you press the button.</p>
          <div className="hero-cta">
            <Link to="/app" className="btn-primary">
              Open the workbench
            </Link>
            <Link to="/" className="btn-ghost">
              Back to overview <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}
