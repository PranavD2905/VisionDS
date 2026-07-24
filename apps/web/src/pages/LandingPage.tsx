import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Reveal } from '../components/site/Reveal';
import { SiteFooter, SiteNav } from '../components/site/SiteChrome';

/* The failing two-sum the hero replays. Kept in sync with languages.ts starter. */
const DEMO_CODE = [
  'def twoSum(nums, t):',
  '  for i in range(n):',
  '    for j in range(i+1, n):',
  '      if nums[i]+nums[j]==t:',
  '        return [i, i]',
];

const STEPS = [
  { n: '01', title: 'Paste, or capture', body: 'Drop in a LeetCode-style solution and its testcases — or let the browser extension lift the code, the problem and the examples straight off the page.' },
  { n: '02', title: 'It actually executes', body: 'Python runs in your browser under a real tracer. C++ and Java compile and step under lldb and JDI. Every line, every local, recorded as a step.' },
  { n: '03', title: 'Watch it, then jump', body: 'Scrub the recording like video. When a case fails, one button seeks to the exact step where your run diverged from the expected answer.' },
];

const FEATURES = [
  {
    tag: 'Diagrams',
    title: 'Built from nothing, every step',
    body: 'Arrays, matrices, hash maps, sets, stacks, queues, linked lists and binary trees are drawn as real diagrams — outlines that trace themselves, cells that spring in, values that flash when they change.',
    span: 'wide',
  },
  {
    tag: 'Pointers',
    title: 'Indices become chips',
    body: 'Integers that stay in bounds of an array are inferred as pointers and ride above the cells, gliding between slots instead of blinking.',
    span: '',
  },
  {
    tag: 'Divergence',
    title: 'The exact wrong step',
    body: 'Verdicts carry a step index. "Jump to failing step" is not a search — it is a seek.',
    span: '',
  },
  {
    tag: 'Transport',
    title: 'Scrub without re-running',
    body: 'Play, pause, speed, step, scrub. The trace is immutable; the cursor is the only thing playback moves. Nothing re-executes.',
    span: '',
  },
  {
    tag: 'AI, fenced in',
    title: 'Decoration, never invention',
    body: 'The optional explainer writes captions against the recorded trace with your own key. Annotations pointing at steps that do not exist are dropped before they render.',
    span: '',
  },
];

const LANGS = [
  { name: 'Python', where: 'Your browser', tracer: 'sys.settrace under Pyodide', state: 'live' },
  { name: 'C++', where: 'Trace service', tracer: 'clang++ -g, stepped by lldb', state: 'live' },
  { name: 'Java', where: 'Trace service', tracer: 'javac -g, stepped by JDI', state: 'live' },
  { name: 'JavaScript', where: '—', tracer: 'one adapter away', state: 'planned' },
];

export function LandingPage() {
  const navigate = useNavigate();

  // The extension hands off at `/#import=…`. Landing lives at `/` now, so pass
  // the fragment through to the workbench untouched. The listener covers the
  // case where the tab is already open on `/` and only the hash changes — that
  // is a same-document navigation, so mount alone would miss it.
  useEffect(() => {
    const forward = () => {
      if (window.location.hash.startsWith('#import=')) {
        navigate(`/app${window.location.hash}`, { replace: true });
      }
    };
    forward();
    window.addEventListener('hashchange', forward);
    return () => window.removeEventListener('hashchange', forward);
  }, [navigate]);

  return (
    <div className="site">
      <SiteNav active="home" />

      {/* ---------- hero ---------- */}
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="stamp boot">
              <span className="led" aria-hidden="true" />
              SYSTEM ONLINE · TRACE v1
            </p>

            <h1 className="hero-title">
              <span className="hero-line a">Your code,</span>
              <span className="hero-line b">
                <em>single</em>-stepped
              </span>
              <span className="hero-line c">and drawn.</span>
            </h1>

            <p className="hero-sub">
              Paste the solution you actually wrote. VisionDS records a real execution of it and
              replays that recording as a fluid diagram — then takes you to the exact step where
              your answer went wrong.
            </p>

            <div className="hero-cta">
              <Link to="/app" className="btn-primary">
                Run my code
              </Link>
              <Link to="/product" className="btn-ghost">
                Read the spec <span aria-hidden="true">→</span>
              </Link>
            </div>

            <ul className="hero-facts">
              <li>
                <strong>Python</strong> never leaves your browser
              </li>
              <li>
                <strong>C++ · Java</strong> compiled &amp; stepped under a debugger
              </li>
              <li>
                <strong>No LLM</strong> writes the steps
              </li>
            </ul>
          </div>

          <div className="hero-screen">
            <DemoScreen />
          </div>
        </div>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {Array.from({ length: 2 }).map((_, k) => (
              <span key={k} className="ticker-run">
                {[
                  'ARRAY',
                  'MATRIX',
                  'HASH MAP',
                  'SET',
                  'STACK',
                  'QUEUE',
                  'LINKED LIST',
                  'BINARY TREE',
                  'POINTERS',
                  'SCALARS',
                  'STDOUT',
                  'EXCEPTIONS',
                ].map((w) => (
                  <span key={w} className="ticker-item">
                    {w}
                    <b>◆</b>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 01 how it runs ---------- */}
      <section className="band" id="how">
        <Reveal className="band-head">
          <span className="stamp">01 / How it runs</span>
          <h2 className="band-title">Three moves, no setup.</h2>
        </Reveal>

        <ol className="steps">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90}>
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------- 02 what you see ---------- */}
      <section className="band alt" id="what">
        <Reveal className="band-head">
          <span className="stamp">02 / What you see</span>
          <h2 className="band-title">
            A debugger you can <em>watch</em>.
          </h2>
          <p className="band-sub">
            Not a table of variables. Every structure in scope is drawn, and the drawing changes
            only in the ways your program changed it.
          </p>
        </Reveal>

        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <Reveal
              as="article"
              key={f.title}
              delay={i * 70}
              className={`feature ${f.span}`.trim()}
            >
              <span className="feature-tag">{f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- 03 principle ---------- */}
      <section className="band creed">
        <Reveal>
          <span className="stamp">03 / The rule everything obeys</span>
          <blockquote className="creed-quote">
            The trace is <span className="glow">ground truth</span>.
          </blockquote>
          <p className="creed-body">
            No model generates or alters a step. The animation replays what a tracer recorded while
            your code ran. If the diagram shows a wrong value, your program produced that value —
            which is the entire point.
          </p>
        </Reveal>
      </section>

      {/* ---------- languages ---------- */}
      <section className="band" id="languages">
        <Reveal className="band-head">
          <span className="stamp">04 / Language support</span>
          <h2 className="band-title">One contract, many runtimes.</h2>
          <p className="band-sub">
            Every runner emits the same <code>ExecutionTrace</code>. Adding a language never touches
            the schema or the UI.
          </p>
        </Reveal>

        <Reveal className="table-wrap">
          <table className="spec-table">
            <thead>
              <tr>
                <th>Language</th>
                <th>Runs in</th>
                <th>Tracer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {LANGS.map((l) => (
                <tr key={l.name}>
                  <td className="cell-name">{l.name}</td>
                  <td>{l.where}</td>
                  <td className="cell-dim">{l.tracer}</td>
                  <td>
                    <span className={`pill ${l.state}`}>{l.state}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="band cta-band">
        <Reveal className="cta-box">
          <span className="stamp">Ready</span>
          <h2>
            Stop reading your code.
            <br />
            Watch it run.
          </h2>
          <p>
            The demo trace loads instantly. Your own Python runs a second later, entirely on this
            machine.
          </p>
          <div className="hero-cta">
            <Link to="/app" className="btn-primary">
              Open the workbench
            </Link>
            <Link to="/product" className="btn-ghost">
              What it can trace <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}

/** The CRT in the hero: a looping, CSS-only replay of the failing two-sum. */
function DemoScreen() {
  return (
    <div className="crt">
      <div className="crt-bar">
        <span className="crt-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="crt-title">two_sum.py — testcase 1</span>
        <span className="crt-step">STEP 41/58</span>
      </div>

      <div className="crt-body" aria-hidden="true">
        <pre className="crt-code">
          <span className="crt-marker" />
          {DEMO_CODE.map((line, i) => (
            <span className="crt-row" key={i}>
              <span className="crt-ln">{i + 1}</span>
              {line}
            </span>
          ))}
        </pre>

        <div className="crt-stage">
          <div className="demo-struct">
            <span className="demo-label">nums · array</span>
            <div className="demo-row">
              {[2, 7, 11, 15].map((v, i) => (
                <span className="demo-col" key={i}>
                  <span className="demo-cell">{v}</span>
                  <span className="demo-idx">{i}</span>
                </span>
              ))}
              <span className="demo-ptr ptr-i">i</span>
              <span className="demo-ptr ptr-j">j</span>
            </div>
          </div>

          <div className="demo-scalars">
            <span className="demo-scalar">
              target<b>9</b>
            </span>
            <span className="demo-scalar">
              nums[i]+nums[j]<b className="sum-val">9</b>
            </span>
          </div>

          <div className="demo-verdict">
            <span className="demo-verdict-word">FAIL</span>
            expected <code>[0,1]</code> · got <code>[0,0]</code>
          </div>
        </div>
      </div>

      <div className="crt-transport" aria-hidden="true">
        <span className="crt-play">▶</span>
        <span className="crt-scrub">
          <i />
        </span>
        <span className="crt-speed">1.0×</span>
      </div>
    </div>
  );
}
