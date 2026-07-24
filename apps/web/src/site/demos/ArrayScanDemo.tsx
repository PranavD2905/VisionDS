/**
 * Two pointers walking an array while a value flashes on the match — the
 * failing two-sum, in miniature. Motion is entirely CSS (see site.css) so the
 * loop costs nothing and pauses correctly under reduced-motion.
 */
export function ArrayScanDemo() {
  return (
    <div className="d-array">
      <div className="d-row">
        {[2, 7, 11, 15].map((v, i) => (
          <span className="d-col" key={i}>
            <span className={`d-cell${i === 1 ? ' d-hit' : ''}`}>{v}</span>
            <span className="d-idx">{i}</span>
          </span>
        ))}
        <span className="d-ptr d-ptr-i">i</span>
        <span className="d-ptr d-ptr-j">j</span>
      </div>
      <div className="d-readout">
        <span className="d-chip">
          target<b>9</b>
        </span>
        <span className="d-chip">
          nums[i]+nums[j]<b className="d-sum">9</b>
        </span>
      </div>
    </div>
  );
}
