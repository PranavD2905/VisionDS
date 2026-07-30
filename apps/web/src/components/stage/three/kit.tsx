/**
 * STAGE3D KIT — shared machinery for every 3D structure scene.
 *
 * Lives inside the lazy three.js chunk. All scenes share one motion model:
 * every animatable quantity is `MathUtils.damp`ed toward a target that is a
 * pure function of the current step's snapshot, so every scene is scrub-safe
 * by construction — a jump retargets mid-flight, exactly like the 2D springs.
 *
 * Colors resolve through the semantic token seam (`token()`), never literals,
 * and re-resolve when `<html data-theme>` changes; the memo is keyed by theme,
 * per the theme-layer caching rule.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { token, type SemanticToken } from '../../../theme/tokens';

export const damp = THREE.MathUtils.damp;

/* ------------------------------------------------------------- geometry -- */

/** Unit box with its origin on the floor, so `scale.y` extrudes upward. */
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.translate(0, 0.5, 0);
export const unitBoxEdges = new THREE.EdgesGeometry(unitBox);

/** Six-sided gem for set members, same floor-origin convention; rotated so a
 *  flat face (not a vertex) fronts the camera and can carry the label. */
export const hexGem = new THREE.CylinderGeometry(0.55, 0.55, 1, 6);
hexGem.rotateY(Math.PI / 6);
hexGem.translate(0, 0.5, 0);
export const hexGemEdges = new THREE.EdgesGeometry(hexGem);

export const plainBox = new THREE.BoxGeometry(1, 1, 1);
export const plainBoxEdges = new THREE.EdgesGeometry(plainBox);

/* ---------------------------------------------------------------- theme -- */

/** Re-render when `<html data-theme>` flips, so materials re-resolve tokens. */
export function useThemeName(): string {
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

export interface StageColors {
  base: THREE.Color;
  accent: THREE.Color;
  warn: THREE.Color;
  pass: THREE.Color;
  ai: THREE.Color;
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
    pass: col(chan('--pass')),
    ai: col(chan('--ai')),
    floor: col(chan('--panel-2')),
    edge: col(edge),
    edgeOpacity: edge[3],
    textCss: token('--text', '#ffffff'),
    textInverseCss: token('--text-inverse', '#000000'),
    mutedCss: token('--muted', '#888888'),
    accentCss: token('--accent', '#e9ff2f'),
  };
}

export function useStageColors(): StageColors {
  const theme = useThemeName();
  return useMemo(resolveColors, [theme]);
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
export function Label({
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

/* ---------------------------------------------------------------- block -- */

/**
 * The universal animated unit: a floor-origin block (or gem) that damps
 * toward `target`, extrudes to height `h`, flashes when its label changes,
 * tints accent while pointed and amber while travelling, and rides an arc —
 * lift proportional to planar distance still to travel — whenever it moves,
 * so reorders read as physical hops. `born` is where it enters from (above
 * for drops, beside for enqueues); omitted, it rises out of the floor.
 */
export function Block3D({
  target,
  born,
  h,
  size = [0.94, 0.94],
  gem = false,
  label,
  labelSize = 0.4,
  pointed = false,
  dir = 0,
  delay = 0,
  colors,
}: {
  target: [number, number, number];
  born?: [number, number, number];
  h: number;
  size?: [number, number];
  gem?: boolean;
  label: string;
  labelSize?: number;
  pointed?: boolean;
  /** travel direction hint: rightward movers ride the higher lane */
  dir?: number;
  delay?: number;
  colors: StageColors;
}) {
  const group = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const plate = useRef<THREE.Group>(null!);
  const s = useRef({ bornYet: false, elapsed: 0, lastDir: 1, flash: 0, prev: label });

  if (label !== s.current.prev) {
    s.current.flash = 1;
    s.current.prev = label;
  }
  if (dir !== 0) s.current.lastDir = dir;

  const [tx, ty, tz] = target;

  useFrame((_, dt) => {
    const st = s.current;
    const g = group.current;
    if (!st.bornYet) {
      st.bornYet = true;
      if (born) g.position.set(born[0], born[1], born[2]);
      else g.position.set(tx, ty, tz); // rise out of the floor in place
      body.current.scale.y = 0.001;
      plate.current.position.y = 0.2;
    }
    st.elapsed += dt;
    if (st.elapsed < delay) return; // entrance stagger

    g.position.x = damp(g.position.x, tx, 7, dt);
    g.position.z = damp(g.position.z, tz, 7, dt);
    const planar = Math.abs(g.position.x - tx) + Math.abs(g.position.z - tz);
    const lift =
      planar > 0.02 ? Math.min(1, planar / 1.2) * (st.lastDir >= 0 ? 1.25 : 0.62) : 0;
    g.position.y = damp(g.position.y, ty + lift, 9, dt);

    body.current.scale.x = size[0];
    body.current.scale.z = size[1];
    const sy = damp(body.current.scale.y, h, 8, dt);
    body.current.scale.y = sy;
    plate.current.position.y = Math.max(0.2, sy * 0.5);

    const moving = planar > 0.12;
    const tint = pointed ? colors.accent : moving ? colors.warn : colors.base;
    mat.current.color.lerp(tint, 1 - Math.exp(-9 * dt));
    st.flash = damp(st.flash, 0, 5, dt);
    mat.current.emissiveIntensity = st.flash * 0.85 + (pointed ? 0.3 : 0);
  });

  return (
    <group ref={group}>
      <mesh ref={body} geometry={gem ? hexGem : unitBox} castShadow dispose={null}>
        <meshStandardMaterial
          ref={mat}
          color={colors.base}
          emissive={colors.accent}
          emissiveIntensity={0}
          roughness={0.55}
          metalness={0.08}
        />
        <lineSegments geometry={gem ? hexGemEdges : unitBoxEdges} dispose={null}>
          <lineBasicMaterial
            color={colors.edge}
            transparent
            opacity={colors.edgeOpacity}
            toneMapped={false}
          />
        </lineSegments>
      </mesh>
      {/* value plate rides the front face, unstretched by the height morph;
          a gem's flat face sits at r·cos30°, past the box convention */}
      <group ref={plate} position={[0, 0.2, gem ? 0.51 : size[1] * 0.5 + 0.038]}>
        <Label
          text={label}
          color={pointed ? colors.textInverseCss : colors.textCss}
          size={labelSize}
          maxW={size[0] * 0.9}
        />
      </group>
    </group>
  );
}

/* ---------------------------------------------------------------- chips -- */

/** Floating pointer marker: acid cone + name plate, damped to its target. */
export function PointerChip3D({
  name,
  x,
  y,
  z = 0,
  colors,
}: {
  name: string;
  x: number;
  y: number;
  z?: number;
  colors: StageColors;
}) {
  const group = useRef<THREE.Group>(null!);
  const born = useRef(false);
  useFrame((_, dt) => {
    const g = group.current;
    if (!born.current) {
      born.current = true;
      g.position.set(x, y + 0.9, z); // drop in from above
    }
    g.position.x = damp(g.position.x, x, 8, dt);
    g.position.y = damp(g.position.y, y, 8, dt);
    g.position.z = damp(g.position.z, z, 8, dt);
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

/* --------------------------------------------------------------- plinth -- */

/** The pedestal everything stands on; its footprint damps as data grows. */
export function Plinth({
  w,
  d = 1.7,
  colors,
}: {
  w: number;
  d?: number;
  colors: StageColors;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    ref.current.scale.x = damp(ref.current.scale.x, w, 7, dt);
    ref.current.scale.z = damp(ref.current.scale.z, d, 7, dt);
  });
  return (
    <mesh
      ref={ref}
      geometry={plainBox}
      position={[0, -0.09, 0]}
      scale={[0.001, 0.17, d]}
      receiveShadow
      dispose={null}
    >
      <meshStandardMaterial color={colors.floor} roughness={0.9} metalness={0} />
      <lineSegments geometry={plainBoxEdges} dispose={null}>
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

/* --------------------------------------------------------------- canvas -- */

/** One canvas per structure: lights, shadows, tilted camera, alpha bg. */
export function StageCanvas({
  width,
  height,
  camera = [0, 4.4, 10.4],
  look = [0, 0.9, 0],
  children,
}: {
  width: number;
  height: number;
  camera?: [number, number, number];
  look?: [number, number, number];
  children: ReactNode;
}) {
  return (
    <div className="array3d" style={{ width, height }}>
      <Canvas
        shadows
        flat
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: camera, fov: 30, near: 0.1, far: 80 }}
        onCreated={({ camera: cam }) => cam.lookAt(look[0], look[1], look[2])}
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
        {children}
      </Canvas>
    </div>
  );
}

/* -------------------------------------------------------------- helpers -- */

/** Map values to extrusion heights; uniform when non-numeric or constant. */
export function normHeights(
  values: unknown[],
  hMin = 0.6,
  hMax = 2.3,
  uniform = 1.0,
): number[] {
  const nums = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (nums.length !== values.length || values.length === 0) {
    return values.map(() => uniform);
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of nums) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) return values.map(() => (hMin + hMax) / 2);
  return nums.map((v) => hMin + ((v - min) / (max - min)) * (hMax - hMin));
}
