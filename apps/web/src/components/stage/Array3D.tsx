/**
 * ARRAY3D — the WebGL stage for numeric arrays.
 *
 * Lazy-loaded (three.js lives in this chunk only) and rendered inside the same
 * SPECIMEN `Frame` as the 2D rail. Blocks are extruded to their value: taller
 * block = bigger number, the visual grammar of every sorting explainer.
 *
 * Motion model: every animatable quantity is exponentially damped toward a
 * target that is a pure function of `steps[cursor]` (position, height, color,
 * flash). That keeps the scene scrub-safe by construction — a jump to any step
 * just retargets the damps mid-flight, exactly like the 2D springs. The swap
 * arc needs no keyframes: a block's lift is proportional to how far it still
 * has to travel, so it rises the instant its slot changes and settles as it
 * arrives; rightward movers ride a higher lane than leftward movers so
 * swapping blocks pass instead of merging.
 *
 * Colors resolve through the semantic token seam (`token()`), never literals,
 * and re-resolve when `<html data-theme>` changes — the color memo is keyed by
 * theme, per the theme-layer rule that caches of resolved tokens must be.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { fmt } from '../../lib/format';
import { token, type SemanticToken } from '../../theme/tokens';
import { useSlotIds } from './slotIds';

export interface Chip {
  name: string;
  index: number;
}

const SP = 1.18; // slot pitch
const H_MIN = 0.6;
const H_MAX = 2.3;
const damp = THREE.MathUtils.damp;

const xFor = (i: number, n: number) => (i - (n - 1) / 2) * SP;

/* Shared geometry, origin on the floor so `scale.y` extrudes upward. */
const blockGeo = new THREE.BoxGeometry(0.94, 1, 0.94);
blockGeo.translate(0, 0.5, 0);
const blockEdges = new THREE.EdgesGeometry(blockGeo);
const floorGeo = new THREE.BoxGeometry(1, 1, 1);
const floorEdges = new THREE.EdgesGeometry(floorGeo);

/* ---------------------------------------------------------------- theme -- */

/** Re-render when `<html data-theme>` flips, so materials re-resolve tokens. */
function useThemeName(): string {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? 'specimen',
  );
  useEffect(() => {
    const mo = new MutationObserver(() =>
      setTheme(document.documentElement.dataset.theme ?? 'specimen'),
    );
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

/** `#hex` / `rgb()` / `rgba()` → channels; alpha defaults to 1. */
function cssRgba(css: string): [number, number, number, number] {
  const v = css.trim();
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    const full =
      hex.length < 6
        ? hex.slice(0, 3).split('').map((c) => c + c).join('')
        : hex.slice(0, 6);
    const num = Number.parseInt(full, 16) || 0;
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 1];
  }
  const nums = v.match(/[\d.]+/g)?.map(Number) ?? [128, 128, 128];
  return [nums[0] ?? 128, nums[1] ?? 128, nums[2] ?? 128, nums[3] ?? 1];
}

interface StageColors {
  base: THREE.Color;
  accent: THREE.Color;
  warn: THREE.Color;
  floor: THREE.Color;
  edge: THREE.Color;
  edgeOpacity: number;
  textCss: string;
  textInverseCss: string;
  mutedCss: string;
  accentCss: string;
}

function resolveColors(): StageColors {
  const chan = (t: SemanticToken) => cssRgba(token(t, '#808080'));
  const col = ([r, g, b]: [number, number, number, number]) =>
    new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  const edge = chan('--border-strong');
  return {
    base: col(chan('--cell-bg-raised')),
    accent: col(chan('--accent')),
    warn: col(chan('--warn')),
    floor: col(chan('--panel-2')),
    edge: col(edge),
    edgeOpacity: edge[3],
    textCss: token('--text', '#ffffff'),
    textInverseCss: token('--text-inverse', '#000000'),
    mutedCss: token('--muted', '#888888'),
    accentCss: token('--accent', '#e9ff2f'),
  };
}

/* --------------------------------------------------------------- labels -- */

function makeLabel(text: string, color: string, bg?: string) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const font = `600 ${48 * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const w = probe.measureText(text).width;
  const padX = (bg ? 22 : 6) * dpr;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.ceil(w + padX * 2));
  canvas.height = Math.ceil((bg ? 76 : 64) * dpr);
  const ctx = canvas.getContext('2d')!;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 14 * dpr);
    ctx.fill();
  }
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2 * dpr);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: canvas.width / canvas.height };
}

/** A crisp text plate (canvas texture); re-bakes when text/colors change. */
function Label({
  text,
  color,
  bg,
  size,
  maxW,
}: {
  text: string;
  color: string;
  bg?: string;
  size: number;
  maxW?: number;
}) {
  const { tex, aspect } = useMemo(() => makeLabel(text, color, bg), [text, color, bg]);
  useEffect(() => () => tex.dispose(), [tex]);
  let w = size * aspect;
  let h = size;
  if (maxW && w > maxW) {
    h *= maxW / w;
    w = maxW;
  }
  return (
    <mesh renderOrder={2}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* --------------------------------------------------------------- blocks -- */

function Block({
  value,
  x,
  h,
  dir,
  pointed,
  delay,
  colors,
}: {
  value: number;
  x: number;
  h: number;
  dir: number;
  pointed: boolean;
  delay: number;
  colors: StageColors;
}) {
  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const plate = useRef<THREE.Group>(null!);
  const s = useRef({ born: false, elapsed: 0, dir: 0, flash: 0, prev: value });

  // render-time event detection (idempotent, like the 2D rail's slot refs)
  if (value !== s.current.prev) {
    s.current.flash = 1;
    s.current.prev = value;
  }
  if (dir !== 0) s.current.dir = dir;

  useFrame((_, dt) => {
    const st = s.current;
    const g = group.current;
    if (!st.born) {
      st.born = true;
      g.position.x = x; // no glide in from origin on mount
      body.current.scale.y = 0.001; // rise out of the floor instead
      plate.current.position.y = 0.22; // …and the value plate rides up with it
    }
    st.elapsed += dt;
    if (st.elapsed < delay) return; // entrance stagger

    g.position.x = damp(g.position.x, x, 7, dt);
    const dx = Math.abs(g.position.x - x);
    // the swap arc: lift ∝ distance still to travel; two lanes so passers miss
    const lift = dx > 0.02 ? Math.min(1, dx / SP) * (st.dir >= 0 ? 1.25 : 0.62) : 0;
    g.position.y = damp(g.position.y, lift, 9, dt);

    const sy = damp(body.current.scale.y, h, 8, dt);
    body.current.scale.y = sy;
    plate.current.position.y = Math.max(0.22, sy * 0.5);

    const moving = dx > 0.12;
    const target = pointed ? colors.accent : moving ? colors.warn : colors.base;
    mat.current.color.lerp(target, 1 - Math.exp(-9 * dt));
    st.flash = damp(st.flash, 0, 5, dt);
    mat.current.emissiveIntensity = st.flash * 0.85 + (pointed ? 0.3 : 0);
  });

  return (
    <group ref={group}>
      <mesh ref={body} geometry={blockGeo} castShadow dispose={null}>
        <meshStandardMaterial
          ref={mat}
          color={colors.base}
          emissive={colors.accent}
          emissiveIntensity={0}
          roughness={0.55}
          metalness={0.08}
        />
        <lineSegments geometry={blockEdges} dispose={null}>
          <lineBasicMaterial
            color={colors.edge}
            transparent
            opacity={colors.edgeOpacity}
            toneMapped={false}
          />
        </lineSegments>
      </mesh>
      {/* value plate rides the front face, unstretched by the height morph */}
      <group ref={plate} position={[0, 0.22, 0.478]}>
        <Label
          text={fmt(value)}
          color={pointed ? colors.textInverseCss : colors.textCss}
          size={0.4}
          maxW={0.82}
        />
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- chips -- */

function PointerChip({
  name,
  index,
  level,
  n,
  heights,
  colors,
}: Chip & { level: number; n: number; heights: number[]; colors: StageColors }) {
  const group = useRef<THREE.Group>(null!);
  const born = useRef(false);
  const clamped = Math.max(-1, Math.min(n, index));
  const x = xFor(clamped, n);
  const overBlock = clamped >= 0 && clamped < n ? heights[clamped]! : 0.55;
  const y = overBlock + 0.06 + level * 0.62;

  useFrame((_, dt) => {
    const g = group.current;
    if (!born.current) {
      born.current = true;
      g.position.set(x, y + 0.9, 0); // drop in from above
    }
    g.position.x = damp(g.position.x, x, 8, dt);
    g.position.y = damp(g.position.y, y, 8, dt);
  });

  return (
    <group ref={group}>
      <mesh rotation-x={Math.PI} position={[0, 0.18, 0]}>
        <coneGeometry args={[0.13, 0.3, 4]} />
        <meshBasicMaterial color={colors.accent} toneMapped={false} />
      </mesh>
      <group position={[0, 0.64, 0]}>
        <Label
          text={name}
          color={colors.textInverseCss}
          bg={colors.accentCss}
          size={0.34}
          maxW={1.5}
        />
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- floor -- */

function Floor({ n, colors }: { n: number; colors: StageColors }) {
  const ref = useRef<THREE.Mesh>(null!);
  const targetW = n * SP + 0.9;
  useFrame((_, dt) => {
    ref.current.scale.x = damp(ref.current.scale.x, targetW, 7, dt);
  });
  return (
    <mesh
      ref={ref}
      geometry={floorGeo}
      position={[0, -0.09, 0]}
      scale={[0.001, 0.17, 1.7]}
      receiveShadow
      dispose={null}
    >
      <meshStandardMaterial color={colors.floor} roughness={0.9} metalness={0} />
      <lineSegments geometry={floorEdges} dispose={null}>
        <lineBasicMaterial
          color={colors.edge}
          transparent
          opacity={colors.edgeOpacity}
          toneMapped={false}
        />
      </lineSegments>
    </mesh>
  );
}

/* ---------------------------------------------------------------- scene -- */

function Scene({ items, pointers }: { items: number[]; pointers: Chip[] }) {
  const theme = useThemeName();
  const colors = useMemo(resolveColors, [theme]);
  const { ids, dir } = useSlotIds(items);
  const n = items.length;
  const { viewport } = useThree();

  let min = Infinity;
  let max = -Infinity;
  for (const v of items) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const heights = items.map((v) =>
    max === min ? 1.15 : H_MIN + ((v - min) / (max - min)) * (H_MAX - H_MIN),
  );

  const pointedAt = new Set(pointers.map((p) => p.index));
  // stack chips that share an index instead of overlapping them
  const seen = new Map<number, number>();
  const chips = pointers.map((p) => {
    const level = seen.get(p.index) ?? 0;
    seen.set(p.index, level + 1);
    return { ...p, level };
  });

  const scale = Math.min(
    1.2,
    (viewport.width * 0.92) / (n * SP + 1.7),
    (viewport.height * 0.98) / 4.3,
  );

  return (
    <group scale={scale} position={[0, -0.45 * scale, 0]}>
      <Floor n={n} colors={colors} />
      {items.map((v, i) => (
        <Block
          key={ids[i]}
          value={v}
          x={xFor(i, n)}
          h={heights[i]!}
          dir={dir[i]!}
          pointed={pointedAt.has(i)}
          delay={i * 0.045}
          colors={colors}
        />
      ))}
      {items.map((_, i) => (
        <group key={`ix-${i}`} position={[xFor(i, n), 0.012, 0.66]} rotation-x={-Math.PI / 2}>
          <Label text={String(i)} color={colors.mutedCss} size={0.24} />
        </group>
      ))}
      {chips.map((c) => (
        <PointerChip key={c.name} {...c} n={n} heights={heights} colors={colors} />
      ))}
    </group>
  );
}

export default function Array3D({ items, pointers }: { items: number[]; pointers: Chip[] }) {
  // width tracks the element count so short arrays don't swim in empty canvas
  const width = Math.min(680, Math.max(300, 110 + items.length * 58));
  return (
    <div className="array3d" style={{ width }}>
      <Canvas
        shadows
        flat
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 4.4, 10.4], fov: 30, near: 0.1, far: 80 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}
      >
        <ambientLight intensity={0.9} />
        <directionalLight
          position={[4.5, 9, 6.5]}
          intensity={2.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        <directionalLight position={[-6, 4, -5]} intensity={0.5} />
        <Scene items={items} pointers={pointers} />
      </Canvas>
    </div>
  );
}
