import { Link } from 'react-router-dom';
import { Reveal } from '../components/site/Reveal';
import { SiteFooter, SiteNav } from '../components/site/SiteChrome';
import {
  CAPS,
  CONTRACT_FIELDS,
  LANGUAGE_SPECS,
  PIPELINE_ASCII,
  PRIVACY_TIERS,
  STATUS_DONE,
  STATUS_TODO,
  STRUCTURES,
} from '../site/content/product';

/** The spec sheet: same framed-module language as the landing catalogue. */
export function ProductPage() {
  return (
    <div className="site">
      <SiteNav active="product" />

      <section className="frame">
        <div className="doc-head">
          <span className="stamp">Spec sheet</span>
          <h1>
            What VisionDS actually <em>is</em>
          </h1>
          <p>
            A dry-run debugger for data-structures practice. You bring a solution and testcases; it
            produces a recorded execution and replays it as animated diagrams. This page is the
            honest version — what it traces, where your code runs, and what it does not do yet.
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
        </div>
      </section>

      {/* pipeline + contract */}
      <section className="frame section" id="pipeline">
        <header className="section-head">
          <span className="stamp">A / The pipeline</span>
          <h2>Code in, recording out</h2>
        </header>
        <Reveal className="ascii-wrap">
          <pre className="ascii">{PIPELINE_ASCII}</pre>
        </Reveal>
        <div className="doc-grid">
          {CONTRACT_FIELDS.map(([k, v], i) => (
            <Reveal as="article" key={k} delay={i * 50} className="doc-card">
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
      <section className="frame section" id="languages">
        <header className="section-head">
          <span className="stamp">B / Language matrix</span>
          <h2>Where each language runs</h2>
        </header>
        <div className="lang-stack">
          {LANGUAGE_SPECS.map((l, i) => (
            <Reveal as="article" key={l.name} delay={i * 60} className="lang-card">
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

      {/* structures */}
      <section className="frame section" id="structures">
        <header className="section-head">
          <span className="stamp">C / What the stage draws</span>
          <h2>Ten shapes, each with its own choreography</h2>
        </header>
        <div className="struct-list">
          {STRUCTURES.map(([name, desc], i) => (
            <Reveal as="div" key={name} delay={i * 30} className="struct-item">
              <span className="struct-item-name">{name}</span>
              <span className="struct-item-desc">{desc}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* privacy */}
      <section className="frame section" id="privacy">
        <header className="section-head">
          <span className="stamp">D / Where your code goes</span>
          <h2>Client-side by default</h2>
        </header>
        <div className="tier-grid">
          {PRIVACY_TIERS.map((t, i) => (
            <Reveal as="article" key={t.n} delay={i * 70} className="tier">
              <span className="tier-n">{t.n}</span>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* caps */}
      <section className="frame section" id="limits">
        <header className="section-head">
          <span className="stamp">E / Limits</span>
          <h2>Hard caps, shared by every runner</h2>
        </header>
        <div className="table-wrap">
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
        </div>
      </section>

      {/* surfaces */}
      <section className="frame section" id="surfaces">
        <header className="section-head">
          <span className="stamp">F / The other two surfaces</span>
          <h2>Extension and accounts</h2>
        </header>
        <div className="doc-grid">
          <Reveal as="article" className="doc-card">
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
          <Reveal as="article" className="doc-card" delay={70}>
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
      <section className="frame section" id="status">
        <header className="section-head">
          <span className="stamp">G / Honest status</span>
          <h2>Done, and not done</h2>
        </header>
        <div className="status-cols">
          <Reveal as="div" className="status-col done">
            <h3>Working today</h3>
            <ul>
              {STATUS_DONE.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal as="div" className="status-col todo" delay={70}>
            <h3>Not built yet</h3>
            <ul>
              {STATUS_TODO.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="frame cta">
        <Reveal>
          <span className="stamp">Ready</span>
          <h2>Bring the solution you are stuck on</h2>
          <p>Python needs nothing installed. It runs the moment you press the button.</p>
          <div className="masthead-cta">
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
