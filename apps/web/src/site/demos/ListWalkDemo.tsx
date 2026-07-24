/** A linked list with `curr` advancing node to node, terminating in null. */
export function ListWalkDemo() {
  return (
    <div className="d-list">
      <span className="d-ptr d-ptr-curr">curr</span>
      {[3, 1, 4].map((v, i) => (
        <span className="d-list-node" key={i}>
          <span className="d-cell">{v}</span>
          <span className="d-list-arrow" aria-hidden="true">
            →
          </span>
        </span>
      ))}
      <span className="d-null">∅</span>
    </div>
  );
}
