/**
 * VS-Code-style region toggles for the workbench.
 *
 * The icon is a miniature of the window: a framed rectangle with the region
 * the button controls drawn inside it — the left column for the whole source
 * panel, a band at the bottom for its testcases. Solid means the region is
 * showing, ghosted means collapsed, so the row of icons reads as a map of the
 * current layout at a glance.
 */
export type PaneRegion = 'source' | 'cases';

/**
 * Where each region's band sits inside the miniature window — matching where
 * the region actually is on screen: the source panel is the left column, the
 * testcases are the bottom strip. Same convention as VS Code's side-bar and
 * panel icons.
 */
const BANDS: Record<PaneRegion, { x: number; y: number; width: number; height: number }> = {
  source: { x: 3.2, y: 3.7, width: 3.7, height: 8.6 },
  cases: { x: 3.4, y: 9.6, width: 9.2, height: 2.7 },
};

export function PaneToggle({
  region,
  on,
  onToggle,
  label,
  controls,
}: {
  region: PaneRegion;
  on: boolean;
  onToggle: () => void;
  label: string;
  /** id of the element this button shows and hides. */
  controls?: string;
}) {
  const band = BANDS[region];
  return (
    <button
      type="button"
      className={`pane-toggle${on ? ' on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      aria-controls={controls}
      aria-label={`${on ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
      title={`${on ? 'Hide' : 'Show'} ${label}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="1.75"
          y="2.25"
          width="12.5"
          height="11.5"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <rect
          x={band.x}
          y={band.y}
          width={band.width}
          height={band.height}
          rx="0.8"
          fill="currentColor"
          opacity={on ? 1 : 0.22}
        />
      </svg>
    </button>
  );
}
