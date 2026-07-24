import { useCallback, useEffect, useState } from 'react';

export type ThemeName = 'specimen' | 'daylight';

export const THEME_STORAGE_KEY = 'visionds:theme';

/** Themes live on `<html data-theme>`; the CSS mapping does the rest. */
function currentTheme(): ThemeName {
  if (typeof document === 'undefined') return 'specimen';
  return document.documentElement.dataset.theme === 'daylight' ? 'daylight' : 'specimen';
}

function apply(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode / storage disabled — the theme still applies for this session
  }
  // keep the browser chrome in step with the page
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      'content',
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
}

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}
type DocWithTransition = Document & {
  startViewTransition?: (cb: () => void) => ViewTransition;
};

/**
 * Theme state plus the circular wipe.
 *
 * The reveal is a View Transition: the browser snapshots the old page, we swap
 * the theme, and the *new* snapshot is clipped by a circle growing from the
 * point that was clicked out to the furthest corner. Everything on screen
 * changes at once, which is what makes it read as a wipe rather than a
 * thousand independent color transitions.
 *
 * Falls back to an instant swap where View Transitions are unsupported or the
 * viewer asked for reduced motion — the theme is the feature, the animation is
 * the flourish.
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(currentTheme);

  // adopt the theme another surface (or another tab) may have set
  useEffect(() => {
    setTheme(currentTheme());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY || !e.newValue) return;
      const next: ThemeName = e.newValue === 'daylight' ? 'daylight' : 'specimen';
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(
    (origin?: { x: number; y: number }) => {
      const next: ThemeName = currentTheme() === 'daylight' ? 'specimen' : 'daylight';
      const doc = document as DocWithTransition;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!doc.startViewTransition || reduced || !origin) {
        apply(next);
        setTheme(next);
        return;
      }

      const { x, y } = origin;
      // radius that reaches the furthest corner from the origin
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );

      const transition = doc.startViewTransition(() => {
        apply(next);
        setTheme(next);
      });

      transition.ready.then(
        () => {
          document.documentElement.animate(
            {
              clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
            },
            {
              duration: 620,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              pseudoElement: '::view-transition-new(root)',
            },
          );
        },
        () => {
          // `ready` rejects whenever the browser skips the transition — a
          // hidden tab, or a second toggle starting before the first settles.
          // The theme itself still applies (that is `finished`), so there is
          // nothing to repair; swallow it so it isn't an unhandled rejection.
        },
      );
    },
    [],
  );

  return { theme, toggle };
}
