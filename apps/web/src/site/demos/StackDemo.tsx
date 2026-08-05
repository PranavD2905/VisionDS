/** A stack filling and draining, with the TOP marker riding the last element. */
export function StackDemo() {
  return (
    <div className="d-stack">
      <span className="d-stack-top">TOP</span>
      <div className="d-stack-col">
        {['(', '[', '{'].map((v, i) => (
          <span className={`d-cell d-stack-cell d-stack-${i}`} key={i}>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
