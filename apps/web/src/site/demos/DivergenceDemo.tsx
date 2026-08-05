/**
 * The step ruler: a run's steps as ticks, with the playhead seeking straight to
 * the step where the answer diverged rather than scrubbing for it.
 */
export function DivergenceDemo() {
  return (
    <div className="d-diverge">
      <div className="d-ruler">
        {Array.from({ length: 24 }).map((_, i) => (
          <span className={`d-tick${i === 17 ? ' d-tick-bad' : ''}`} key={i} />
        ))}
        <span className="d-head" />
      </div>
      <div className="d-verdict">
        <span className="d-verdict-word">FAIL</span>
        <span>
          expected <code>[0,1]</code> · got <code>[0,0]</code>
        </span>
      </div>
    </div>
  );
}
