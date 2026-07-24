import { Link, NavLink } from 'react-router-dom';
import { AccountMenu } from '../../auth/AccountMenu';

/**
 * Marketing-surface chrome (landing + spec page). Deliberately thin: the nav is
 * a hairline rail of stamped labels, the footer is a terminal sign-off. The app
 * itself (PastePage/RunPage) keeps its own denser header.
 */
export function SiteNav({ active }: { active?: 'home' | 'product' }) {
  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link to="/" className="wordmark" aria-label="VisionDS home">
          <span className="wordmark-mark" aria-hidden="true">
            ▚
          </span>
          <span>
            VISION<span className="wordmark-dim">DS</span>
          </span>
        </Link>

        <nav className="site-nav-links" aria-label="Primary">
          <NavLink to="/" className={active === 'home' ? 'is-active' : undefined} end>
            Overview
          </NavLink>
          <NavLink to="/product" className={active === 'product' ? 'is-active' : undefined}>
            Spec sheet
          </NavLink>
          <a href="https://github.com/PranavD2905/VisionDS" target="_blank" rel="noreferrer">
            Source
          </a>
        </nav>

        <div className="site-nav-right">
          <AccountMenu />
          <Link to="/app" className="nav-cta">
            Run code <span aria-hidden="true">▸</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="wordmark">
            <span className="wordmark-mark" aria-hidden="true">
              ▚
            </span>
            <span>
              VISION<span className="wordmark-dim">DS</span>
            </span>
          </span>
          <p>
            A dry-run debugger for people learning data structures. Your code, single-stepped and
            drawn.
          </p>
        </div>

        <div className="footer-col">
          <h3>Product</h3>
          <Link to="/app">Workbench</Link>
          <Link to="/product">Spec sheet</Link>
          <Link to="/product#languages">Language matrix</Link>
          <Link to="/product#privacy">Where code runs</Link>
        </div>

        <div className="footer-col">
          <h3>Runtime</h3>
          <span>Python — Pyodide, in-browser</span>
          <span>C++ — clang++ / lldb</span>
          <span>Java — javac / JDI</span>
        </div>
      </div>

      <div className="site-footer-rule" aria-hidden="true" />

      <div className="site-footer-base">
        <span>© 2026 VisionDS</span>
        <span className="footer-creed">The trace is ground truth.</span>
        <span className="footer-cursor" aria-hidden="true">
          READY_
        </span>
      </div>
    </footer>
  );
}
