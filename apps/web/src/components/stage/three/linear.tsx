/**
 * Linear scenes: the array/string rail, the stack tower, the queue conveyor.
 * All read as "blocks on a plinth"; what differs is the axis and the door
 * new elements come through (floor, sky, or the rear of the lane).
 */
import { useFrame, useThree } from '@react-three/fiber';
import type { JsonValue } from '@visionds/trace-schema';
import { useRef } from 'react';
import * as THREE from 'three';
import { fmt } from '../../../lib/format';
import { useSlotIds } from '../slotIds';
import {
  Block3D,
  damp,
  Label,
  Plinth,
  PointerChip3D,
  normHeights,
  useStageColors,
} from './kit';

export interface Chip {
  name: string;
  index: number;
}

const SP = 1.18;
const xFor = (i: number, n: number) => (i - (n - 1) / 2) * SP;

/* ---------------------------------------------------------------- array -- */

/**
 * The block rail: numeric arrays extrude to their value; mixed/string content
 * keeps uniform tiles (position is the meaning, not magnitude). Identity via
 * slot ids, so swaps arc past each other exactly like the 2D rail.
 */
export function ArrayScene({
  items,
  pointers,
  raw = false,
}: {
  items: JsonValue[];
  pointers: Chip[];
  raw?: boolean;
}) {
  const colors = useStageColors();
  const { ids, dir } = useSlotIds(items);
  const n = items.length;
  const { viewport } = useThree();
  const heights = normHeights(items);
  const pointedAt = new Set(pointers.map((p) => p.index));
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
      <Plinth w={n * SP + 0.9} colors={colors} />
      {items.map((v, i) => (
        <Block3D
          key={ids[i]}
          target={[xFor(i, n), 0, 0]}
          h={heights[i]!}
          dir={dir[i]!}
          label={raw ? String(v) : fmt(v)}
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
      {chips.map((c) => {
        const idx = Math.max(-1, Math.min(n, c.index));
        const over = idx >= 0 && idx < n ? heights[idx]! : 0.55;
        return (
          <PointerChip3D
            key={c.name}
            name={c.name}
            x={xFor(idx, n)}
            y={over + 0.06 + c.level * 0.62}
            colors={colors}
          />
        );
      })}
    </group>
  );
}

/* ---------------------------------------------------------------- stack -- */

/** A side tag that tracks its slab's level (for `top` and pointer locals). */
function SideTag({
  text,
  y,
  colors,
  accent = false,
}: {
  text: string;
  y: number;
  colors: ReturnType<typeof useStageColors>;
  accent?: boolean;
}) {
  const group = useRef<THREE.Group>(null!);
  const born = useRef(false);
  useFrame((_, dt) => {
    const g = group.current;
    if (!born.current) {
      born.current = true;
      g.position.set(-1.95, y, 0);
    }
    g.position.y = damp(g.position.y, y, 8, dt);
  });
  return (
    <group ref={group} position={[-1.95, y, 0]}>
      <Label
        text={text}
        color={accent ? colors.textInverseCss : colors.textCss}
        bg={accent ? colors.accentCss : undefined}
        size={0.32}
        maxW={1.6}
      />
    </group>
  );
}

const SLAB_H = 0.44;
const SLAB_STEP = 0.52;

/**
 * The tower: index 0 at the base, pushes drop in from above and land on the
 * summit, the `top` tag rides the highest slab.
 */
export function StackScene({ items, pointers }: { items: JsonValue[]; pointers: Chip[] }) {
  const colors = useStageColors();
  const n = items.length;
  const { viewport } = useThree();
  const scale = Math.min(
    1.15,
    (viewport.width * 0.9) / 5.2,
    (viewport.height * 0.9) / (n * SLAB_STEP + 3.4),
  );

  return (
    // center the tower (plinth → top tag) on the camera's look point
    <group scale={scale} position={[0, 1.3 - ((n * SLAB_STEP + 0.7) * scale) / 2, 0]}>
      <Plinth w={3.1} d={2.3} colors={colors} />
      {items.map((v, i) => (
        <Block3D
          key={i}
          target={[0, i * SLAB_STEP, 0]}
          born={[0, n * SLAB_STEP + 1.6, 0]}
          h={SLAB_H}
          size={[2.35, 1.5]}
          label={fmt(v)}
          labelSize={0.34}
          delay={i * 0.05}
          colors={colors}
        />
      ))}
      {n > 0 && (
        <SideTag
          text="top →"
          y={(n - 1) * SLAB_STEP + SLAB_H / 2}
          colors={colors}
          accent
        />
      )}
      {pointers
        .filter((p) => p.index >= 0 && p.index < n)
        .map((p) => (
          <SideTag
            key={p.name}
            text={`${p.name} →`}
            y={p.index * SLAB_STEP + SLAB_H / 2 + 0.36}
            colors={colors}
          />
        ))}
      {n === 0 && (
        <group position={[0, 0.5, 0]}>
          <Label text="empty" color={colors.mutedCss} size={0.34} />
        </group>
      )}
    </group>
  );
}

/* ---------------------------------------------------------------- queue -- */

/**
 * The conveyor: front exits left, rear enters right. Identity comes from a
 * running "how many ever left the front" offset (the QueueView trick), so a
 * dequeue reads as the whole line gliding forward.
 */
export function QueueScene({ items, pointers }: { items: JsonValue[]; pointers: Chip[] }) {
  const colors = useStageColors();
  const n = items.length;
  const { viewport } = useThree();
  const heights = normHeights(items, 0.7, 1.5, 0.9);

  const idRef = useRef({ prev: [] as JsonValue[], offset: 0 });
  const { prev } = idRef.current;
  const d = prev.length - items.length;
  const sig = (a: JsonValue[]) => JSON.stringify(a);
  if (d > 0 && sig(prev.slice(d)) === sig(items)) {
    idRef.current.offset += d; // items left the front
  } else if (d < 0 && sig(items.slice(-d)) === sig(prev)) {
    idRef.current.offset += d; // scrubbed backwards: fronts restored
  }
  idRef.current.prev = items;
  const base = idRef.current.offset;

  const pointedAt = new Set(pointers.map((p) => p.index));
  const scale = Math.min(
    1.15,
    (viewport.width * 0.92) / (n * SP + 2.6),
    (viewport.height * 0.95) / 3.6,
  );

  return (
    <group scale={scale} position={[0, -0.35 * scale, 0]}>
      <Plinth w={n * SP + 2.2} colors={colors} />
      {items.map((v, i) => (
        <Block3D
          key={base + i}
          target={[xFor(i, n), 0, 0]}
          born={[xFor(n - 1, n) + 2.1, 0.5, 0]}
          h={heights[i]!}
          label={fmt(v)}
          pointed={pointedAt.has(i)}
          delay={i * 0.045}
          colors={colors}
        />
      ))}
      {pointers
        .filter((p) => p.index >= 0 && p.index < n)
        .map((p) => (
          <PointerChip3D
            key={p.name}
            name={p.name}
            x={xFor(p.index, n)}
            y={heights[p.index]! + 0.06}
            colors={colors}
          />
        ))}
      <group
        position={[xFor(0, n) - 1.35, 0.012, 0.4]}
        rotation-x={-Math.PI / 2}
      >
        <Label text="← out" color={colors.mutedCss} size={0.26} />
      </group>
      <group
        position={[xFor(n - 1, n) + 1.35, 0.012, 0.4]}
        rotation-x={-Math.PI / 2}
      >
        <Label text="in ←" color={colors.mutedCss} size={0.26} />
      </group>
      {n === 0 && (
        <group position={[0, 0.5, 0]}>
          <Label text="empty" color={colors.mutedCss} size={0.34} />
        </group>
      )}
    </group>
  );
}
