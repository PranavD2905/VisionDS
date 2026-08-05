/**
 * Keyed scenes: the dict as labeled landing pads (value blocks drop onto
 * their key's pad), the set as a honeycomb of gems (membership has no order,
 * so the packing is radial, not a lane).
 */
import { useThree } from '@react-three/fiber';
import type { JsonValue } from '@visionds/trace-schema';
import { fmt } from '../../../lib/format';
import {
  Block3D,
  Label,
  Plinth,
  plainBox,
  plainBoxEdges,
  normHeights,
  useStageColors,
} from './kit';

/* ----------------------------------------------------------------- dict -- */

const PAD_X = 1.5;
const PAD_Z = 2.0;

export function DictScene({ entries }: { entries: [string, JsonValue][] }) {
  const colors = useStageColors();
  const n = entries.length;
  const cols = Math.max(1, Math.min(6, n));
  const rowsN = Math.max(1, Math.ceil(n / cols));
  const { viewport } = useThree();
  const heights = normHeights(entries.map(([, v]) => v), 0.5, 1.7, 0.8);

  const xFor = (i: number) => ((i % cols) - (cols - 1) / 2) * PAD_X;
  const zFor = (i: number) => (Math.floor(i / cols) - (rowsN - 1) / 2) * PAD_Z;

  const scale = Math.min(
    1.1,
    (viewport.width * 0.9) / (cols * PAD_X + 1.4),
    (viewport.height * 1.15) / (rowsN * PAD_Z + 3.6),
  );

  return (
    <group scale={scale} position={[0, -0.35 * scale, 0]}>
      <Plinth w={cols * PAD_X + 0.8} d={rowsN * PAD_Z + 0.7} colors={colors} />
      {entries.map(([k, v], i) => (
        <group key={k}>
          {/* the landing pad, stamped with its key */}
          <mesh
            geometry={plainBox}
            position={[xFor(i), 0.045, zFor(i)]}
            scale={[1.28, 0.09, 1.28]}
            receiveShadow
            dispose={null}
          >
            <meshStandardMaterial color={colors.floor} roughness={0.85} metalness={0} />
            <lineSegments geometry={plainBoxEdges} dispose={null}>
              <lineBasicMaterial
                color={colors.edge}
                transparent
                opacity={colors.edgeOpacity}
                toneMapped={false}
              />
            </lineSegments>
          </mesh>
          <group
            position={[xFor(i), 0.1, zFor(i) + 0.92]}
            rotation-x={-Math.PI / 2}
          >
            <Label text={k} color={colors.mutedCss} size={0.26} maxW={1.4} />
          </group>
          {/* the value block drops onto its pad; height encodes numeric value */}
          <Block3D
            target={[xFor(i), 0.09, zFor(i)]}
            born={[xFor(i), 2.4, zFor(i)]}
            h={heights[i]!}
            size={[0.9, 0.9]}
            label={fmt(v)}
            labelSize={0.32}
            delay={i * 0.06}
            colors={colors}
          />
        </group>
      ))}
      {n === 0 && (
        <group position={[0, 0.5, 0]}>
          <Label text="empty" color={colors.mutedCss} size={0.34} />
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ set -- */

/** Axial hex-spiral position for the i-th member (0 = center, then rings). */
function hexSpiral(i: number): [number, number] {
  if (i === 0) return [0, 0];
  let ring = 1;
  let count = 1;
  while (count + ring * 6 <= i) {
    count += ring * 6;
    ring++;
  }
  const pos = i - count;
  const side = Math.floor(pos / ring);
  const step = pos % ring;
  // walk the six sides of the ring in axial coordinates
  const corners: [number, number][] = [
    [ring, 0],
    [0, ring],
    [-ring, ring],
    [-ring, 0],
    [0, -ring],
    [ring, -ring],
  ];
  const dirs: [number, number][] = [
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
  ];
  const [cq, cr] = corners[side]!;
  const [dq, dr] = dirs[side]!;
  return [cq + dq * step, cr + dr * step];
}

const HEX = 1.22;

export function SetScene({ items }: { items: JsonValue[] }) {
  const colors = useStageColors();
  const n = items.length;
  const { viewport } = useThree();
  const rings = n <= 1 ? 0 : Math.ceil((-3 + Math.sqrt(9 + 12 * (n - 1))) / 6);
  const span = (rings * 2 + 1) * HEX;

  const scale = Math.min(
    1.1,
    (viewport.width * 0.88) / (span + 1.2),
    (viewport.height * 1.1) / (span * 0.9 + 3.2),
  );

  return (
    <group scale={scale} position={[0, -0.35 * scale, 0]}>
      <Plinth w={span + 0.8} d={span * 0.92 + 0.8} colors={colors} />
      {items.map((v, i) => {
        const [q, r] = hexSpiral(i);
        const x = HEX * (q + r / 2);
        const z = HEX * 0.87 * r;
        return (
          <Block3D
            key={fmt(v)}
            target={[x, 0, z]}
            born={[x, 2.4, z]}
            h={0.85}
            gem
            label={fmt(v)}
            labelSize={0.32}
            delay={i * 0.05}
            colors={colors}
          />
        );
      })}
      {n === 0 && (
        <group position={[0, 0.5, 0]}>
          <Label text="empty" color={colors.mutedCss} size={0.34} />
        </group>
      )}
    </group>
  );
}
