/**
 * The recording itself: steps streaming past as a tape of line numbers and
 * events. The point of the exhibit is that these came out of a real run.
 */
const STEPS = [
  ['02', 'line', 'i = 0'],
  ['03', 'line', 'j = 1'],
  ['04', 'line', 'nums[i]+nums[j]'],
  ['05', 'line', 'return [i, i]'],
  ['05', 'ret', '[0, 0]'],
];

export function TraceTapeDemo() {
  return (
    <div className="d-tape">
      <div className="d-tape-track">
        {[0, 1].map((copy) => (
          <div className="d-tape-run" key={copy}>
            {STEPS.map(([line, event, detail], i) => (
              <span className="d-tape-step" key={`${copy}-${i}`}>
                <b>{line}</b>
                <em>{event}</em>
                {detail}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
