/** A hash map filling one key → value row at a time, joined by drawn arrows. */
export function MapDemo() {
  const rows = [
    ['2', '0'],
    ['7', '1'],
    ['11', '2'],
  ];
  return (
    <div className="d-map">
      {rows.map(([k, v], i) => (
        <div className={`d-map-row d-map-${i}`} key={k}>
          <span className="d-map-key">{k}</span>
          <span className="d-map-arrow" aria-hidden="true">
            →
          </span>
          <span className="d-cell d-map-val">{v}</span>
        </div>
      ))}
    </div>
  );
}
