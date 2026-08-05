import type { MouseEvent } from 'react';
import { useTheme } from '../theme/useTheme';

/**
 * Light/dark switch. The wipe starts from the button itself, so the origin is
 * taken from the button's own centre rather than the pointer — keyboard
 * activation then produces the same animation as a click.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme !== 'daylight';

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    toggle({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  };

  return (
    <button
      type="button"
      className={`theme-toggle${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light' : 'Dark'}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-knob" />
      </span>
      <span className="theme-toggle-label" aria-hidden="true">
        {dark ? 'DARK' : 'LIGHT'}
      </span>
    </button>
  );
}
