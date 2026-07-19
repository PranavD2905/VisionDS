import { useEffect } from 'react';
import { useActiveTrace, useVis } from '../store';

const SPEEDS = [0.5, 1, 2, 4];
const BASE_STEP_MS = 500;

export function Transport() {
  const trace = useActiveTrace();
  const { cursor, playing, speed, seek, stepBy, setPlaying, setSpeed } = useVis();
  const total = trace?.steps.length ?? 0;

  // play loop: advance the cursor on an interval scaled by speed
  useEffect(() => {
    if (!playing || total === 0) return;
    const id = setInterval(() => useVis.getState().stepBy(1), BASE_STEP_MS / speed);
    return () => clearInterval(id);
  }, [playing, speed, total]);

  // arrow keys step, space toggles play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') stepBy(1);
      else if (e.key === 'ArrowLeft') stepBy(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying(!useVis.getState().playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepBy, setPlaying]);

  if (total === 0) return null;

  return (
    <div className="transport">
      <button onClick={() => stepBy(-1)} disabled={cursor === 0} aria-label="step back">
        ⏮
      </button>
      <button className="play" onClick={() => setPlaying(!playing)} aria-label="play/pause">
        {playing ? '⏸' : '▶'}
      </button>
      <button
        onClick={() => stepBy(1)}
        disabled={cursor >= total - 1}
        aria-label="step forward"
      >
        ⏭
      </button>
      <input
        type="range"
        min={0}
        max={total - 1}
        value={cursor}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="scrub timeline"
      />
      <span className="step-counter">
        {cursor + 1} / {total}
      </span>
      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        aria-label="speed"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </div>
  );
}
