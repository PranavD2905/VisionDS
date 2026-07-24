import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Reveal } from '../components/site/Reveal';
import { SiteFooter, SiteNav } from '../components/site/SiteChrome';
import { Specimen, SpecimenGrid } from '../site/Specimen';
import { ArrayScanDemo } from '../site/demos/ArrayScanDemo';
import { LANDING_SPECIMENS, LANGUAGE_ROWS, PIPELINE_STEPS } from '../site/content/landing';

/**
 * The landing page composes the catalogue; it does not define it. Specimens
 * come from content, demos come from the registry, and the frame comes from
 * `Specimen` — so this file stays a page rather than becoming the whole site.
 */
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

      {/* ---------- masthead: one specimen, stated plainly ---------- */}
      <section className="frame masthead">
        <div className="masthead-copy">
          <p className="stamp">
            <span className="led" aria-hidden="true" />
            Dry-run debugger · v1
          </p>
          <h1 className="masthead-title">
            Watch <em>your own code</em> run, step by step, and land on the line that broke it.
          </h1>
        </div>

        <div className="masthead-demo">
          <div className="masthead-demo-inner">
            <ArrayScanDemo />
          </div>
        </div>

        <div className="masthead-bar">
          <div className="masthead-cta">
            <Link to="/app" className="btn-primary">
              Run my code
            </Link>
            <Link to="/product" className="btn-ghost">
              Spec sheet <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ul className="masthead-facts">
            <li>
              <b>Python</b> in-browser
            </li>
            <li>
              <b>C++ · Java</b> under a debugger
            </li>
            <li>
              <b>No LLM</b> writes the steps
            </li>
          </ul>
        </div>
      </section>

      {/* ---------- the catalogue ---------- */}
      <section className="frame section" id="catalogue">
        <header className="section-head">
          <span className="stamp">Catalogue</span>
          <h2>What it draws</h2>
          <p>
            Every structure in scope becomes a diagram that changes only in the ways your program
            changed it. Six of them, live, below.
          </p>
        </header>

        <SpecimenGrid>
          {LANDING_SPECIMENS.map((spec, i) => (
            <Reveal key={spec.id} delay={i * 60} className={`spec-wrap spec-span-${spec.span ?? 1}`}>
              <Specimen spec={spec} />
            </Reveal>
          ))}
        </SpecimenGrid>
      </section>

      {/* ---------- pipeline ---------- */}
      <section className="frame section" id="how">
        <header className="section-head">
          <span className="stamp">Pipeline</span>
          <h2>Three moves, no setup</h2>
        </header>

        <ol className="steps">
          {PIPELINE_STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 80}>
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------- creed ---------- */}
      <section className="frame creed">
        <Reveal>
          <span className="stamp">The rule everything obeys</span>
          <blockquote>
            The trace is <em>ground truth</em>.
          </blockquote>
          <p>
            No model generates or alters a step. The animation replays what a tracer recorded while
            your code ran. If the diagram shows a wrong value, your program produced that value —
            which is the entire point.
          </p>
        </Reveal>
      </section>

      {/* ---------- runtimes ---------- */}
      <section className="frame section" id="languages">
        <header className="section-head">
          <span className="stamp">Runtimes</span>
          <h2>One contract, many languages</h2>
          <p>
            Every runner emits the same <code>ExecutionTrace</code>. Adding a language never touches
            the schema or the UI.
          </p>
        </header>

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
              {LANGUAGE_ROWS.map((l) => (
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

      {/* ---------- close ---------- */}
      <section className="frame cta">
        <Reveal>
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
          <div className="masthead-cta">
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
