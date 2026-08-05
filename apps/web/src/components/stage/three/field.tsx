/**
 * The height-field: a numeric matrix as terrain. Each cell is an extruded
 * block; a DP table run reads as the solution surface assembling itself,
 * fill-order made visible by the (row+col) diagonal entrance wave.
 */
import { useThree } from '@react-three/fiber';
import { fmt } from '../../../lib/format';
import { Block3D, Label, Plinth, normHeights, useStageColors } from './kit';

const SP = 0.98;

export function MatrixScene({ rows }: { rows: number[][] }) {
  const colors = useStageColors();
  const m = rows.length;
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const { viewport } = useThree();

  const flat = rows.flat();
  const heights = normHeights(flat, 0.25, 1.6, 0.6);
  const hAt = (r: number, c: number) => {
    let k = 0;
    for (let i = 0; i < r; i++) k += rows[i]!.length;
    return heights[k + c] ?? 0.25;
  };

  const xFor = (c: number) => (c - (cols - 1) / 2) * SP;
  const zFor = (r: number) => (r - (m - 1) / 2) * SP;

  const scale = Math.min(
    1.45,
    (viewport.width * 0.9) / (cols * SP + 1.6),
    (viewport.height * 1.35) / (m * SP + 4.2),
  );

  return (
    <group scale={scale} position={[0, -0.3 * scale, 0]}>
      <Plinth w={cols * SP + 0.9} d={m * SP + 0.9} colors={colors} />
      {rows.map((row, r) =>
        row.map((v, c) => (
          <Block3D
            key={`${r}:${c}`}
            target={[xFor(c), 0, zFor(r)]}
            h={hAt(r, c)}
            size={[0.86, 0.86]}
            label={fmt(v)}
            labelSize={0.3}
            delay={(r + c) * 0.055}
            colors={colors}
          />
        )),
      )}
      {/* column indices along the front edge, row indices down the left */}
      {Array.from({ length: cols }, (_, c) => (
        <group
          key={`c${c}`}
          position={[xFor(c), 0.012, zFor(m - 1) + 0.78]}
          rotation-x={-Math.PI / 2}
        >
          <Label text={String(c)} color={colors.mutedCss} size={0.22} />
        </group>
      ))}
      {Array.from({ length: m }, (_, r) => (
        <group
          key={`r${r}`}
          position={[xFor(0) - 0.82, 0.012, zFor(r)]}
          rotation-x={-Math.PI / 2}
        >
          <Label text={String(r)} color={colors.mutedCss} size={0.22} />
        </group>
      ))}
    </group>
  );
}
