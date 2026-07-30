/**
 * Graph scenes: the linked list as a chain of blocks joined by arrow struts
 * (a cycle arcs back over the top), the binary tree as a hanging mobile —
 * spheres at depth-layered heights, root on top, joined by struts.
 */
import { useFrame, useThree } from '@react-three/fiber';
import type { JsonValue } from '@visionds/trace-schema';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fmt } from '../../../lib/format';
import { layoutTree, type TreeValue } from '../treeLayout';
import { Block3D, damp, Label, Plinth, useStageColors, type StageColors } from './kit';

/* ----------------------------------------------------------------- list -- */

const LSP = 1.72;

/** A horizontal → arrow between two chain nodes. */
function ChainArrow({ x, y, colors }: { x: number; y: number; colors: StageColors }) {
  return (
    <group position={[x, y, 0]}>
      <mesh rotation-z={-Math.PI / 2}>
        <cylinderGeometry args={[0.035, 0.035, 0.52, 8]} />
        <meshBasicMaterial color={colors.edge} toneMapped={false} />
      </mesh>
      <mesh position={[0.31, 0, 0]} rotation-z={-Math.PI / 2}>
        <coneGeometry args={[0.09, 0.2, 8]} />
        <meshBasicMaterial color={colors.edge} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The arched tube a cycle rides from the tail back to its target node. */
function CycleArc({
  fromX,
  toX,
  topY,
  colors,
}: {
  fromX: number;
  toX: number;
  topY: number;
  colors: StageColors;
}) {
  const geo = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(fromX, topY, 0),
      new THREE.Vector3((fromX + toX) / 2, topY + 1.35, 0),
      new THREE.Vector3(toX, topY + 0.18, 0),
    );
    return new THREE.TubeGeometry(curve, 24, 0.035, 8);
  }, [fromX, toX, topY]);
  return (
    <group>
      <mesh geometry={geo}>
        <meshBasicMaterial color={colors.accent} toneMapped={false} />
      </mesh>
      <mesh position={[toX, topY + 0.12, 0]} rotation-x={Math.PI}>
        <coneGeometry args={[0.09, 0.2, 8]} />
        <meshBasicMaterial color={colors.accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function ListScene({
  vals,
  cyclesTo,
}: {
  vals: JsonValue[];
  cyclesTo: number | null;
}) {
  const colors = useStageColors();
  const n = vals.length;
  const { viewport } = useThree();
  const xFor = (i: number) => (i - (n - 1) / 2) * LSP;
  const H = 1.0;

  const scale = Math.min(
    1.15,
    (viewport.width * 0.92) / (n * LSP + 1.8),
    (viewport.height * 0.95) / (cyclesTo !== null ? 4.4 : 3.4),
  );

  return (
    <group scale={scale} position={[0, -0.35 * scale, 0]}>
      <Plinth w={n * LSP + 1.4} colors={colors} />
      {vals.map((v, i) => (
        <Block3D
          key={i}
          target={[xFor(i), 0, 0]}
          h={H}
          label={fmt(v)}
          delay={i * 0.06}
          colors={colors}
        />
      ))}
      {vals.map(
        (_, i) =>
          i < n - 1 && (
            <ChainArrow key={`a${i}`} x={xFor(i) + LSP / 2} y={H / 2} colors={colors} />
          ),
      )}
      {n > 0 && cyclesTo === null && (
        <>
          <ChainArrow x={xFor(n - 1) + LSP / 2} y={H / 2} colors={colors} />
          <group position={[xFor(n - 1) + LSP - 0.05, H / 2, 0]}>
            <Label text="∅" color={colors.mutedCss} size={0.42} />
          </group>
        </>
      )}
      {n > 0 && cyclesTo !== null && (
        <CycleArc fromX={xFor(n - 1)} toX={xFor(cyclesTo)} topY={H} colors={colors} />
      )}
      {n === 0 && (
        <group position={[0, 0.5, 0]}>
          <Label text="null" color={colors.mutedCss} size={0.34} />
        </group>
      )}
    </group>
  );
}

/* ----------------------------------------------------------------- tree -- */

const T_COL = 0.95;
const T_ROW = 1.15;

/** One tree node: a sphere that pops in by depth and flashes on mutation. */
function TreeOrb({
  pos,
  label,
  delay,
  colors,
}: {
  pos: [number, number, number];
  label: string;
  delay: number;
  colors: StageColors;
}) {
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const s = useRef({ bornYet: false, elapsed: 0, flash: 0, prev: label });
  if (label !== s.current.prev) {
    s.current.flash = 1;
    s.current.prev = label;
  }
  useFrame((_, dt) => {
    const st = s.current;
    if (!st.bornYet) {
      st.bornYet = true;
      mesh.current.scale.setScalar(0.001);
    }
    st.elapsed += dt;
    if (st.elapsed < delay) return;
    const k = damp(mesh.current.scale.x, 1, 8, dt);
    mesh.current.scale.setScalar(k);
    st.flash = damp(st.flash, 0, 5, dt);
    mat.current.emissiveIntensity = st.flash * 0.85;
  });
  return (
    <group position={pos}>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[0.42, 24, 18]} />
        <meshStandardMaterial
          ref={mat}
          color={colors.base}
          emissive={colors.accent}
          emissiveIntensity={0}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>
      <group position={[0, 0, 0.46]}>
        <Label text={label} color={colors.textCss} size={0.34} maxW={0.8} />
      </group>
    </group>
  );
}

/** A rigid strut between two node centers. */
function Strut({
  a,
  b,
  colors,
}: {
  a: [number, number, number];
  b: [number, number, number];
  colors: StageColors;
}) {
  const { mid, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    return { mid, quat, len };
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]);
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[0.035, 0.035, len, 8]} />
      <meshBasicMaterial
        color={colors.edge}
        transparent
        opacity={Math.min(1, colors.edgeOpacity * 3)}
        toneMapped={false}
      />
    </mesh>
  );
}

export function TreeScene({ root }: { root: TreeValue | null }) {
  const colors = useStageColors();
  const { nodes, edges, cols, depth } = layoutTree(root);
  const { viewport } = useThree();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const posOf = (n: { col: number; depth: number }): [number, number, number] => [
    (n.col - (cols - 1) / 2) * T_COL,
    (depth - n.depth) * T_ROW + 0.75,
    0,
  ];

  const scale = Math.min(
    1.1,
    (viewport.width * 0.92) / (cols * T_COL + 1.6),
    (viewport.height * 0.94) / ((depth + 1) * T_ROW + 1.9),
  );

  return (
    <group scale={scale} position={[0, -0.4 * scale, 0]}>
      <Plinth w={cols * T_COL + 1.0} colors={colors} />
      {edges.map((e) => (
        <Strut
          key={`${e.from}-${e.to}`}
          a={posOf(byId.get(e.from)!)}
          b={posOf(byId.get(e.to)!)}
          colors={colors}
        />
      ))}
      {nodes.map((n) => (
        <TreeOrb
          key={n.id}
          pos={posOf(n)}
          label={fmt(n.val)}
          delay={n.depth * 0.09}
          colors={colors}
        />
      ))}
      {nodes.length === 0 && (
        <group position={[0, 0.5, 0]}>
          <Label text="null" color={colors.mutedCss} size={0.34} />
        </group>
      )}
    </group>
  );
}
