import type { DemoComponent } from '../types';
import { ArrayScanDemo } from './ArrayScanDemo';
import { DivergenceDemo } from './DivergenceDemo';
import { ListWalkDemo } from './ListWalkDemo';
import { MapDemo } from './MapDemo';
import { StackDemo } from './StackDemo';
import { TraceTapeDemo } from './TraceTapeDemo';

/**
 * Demo registry.
 *
 * The frame resolves demos by id through this map, so `Specimen` never
 * branches on which demo it is showing and never imports one. Adding an
 * exhibit means adding a file and one line here — nothing that already works
 * gets edited.
 */
const registry: Record<string, DemoComponent> = {
  'array-scan': ArrayScanDemo,
  divergence: DivergenceDemo,
  'list-walk': ListWalkDemo,
  map: MapDemo,
  stack: StackDemo,
  'trace-tape': TraceTapeDemo,
};

/** Returns the demo for an id, or null when the id is unknown — an unknown
 *  exhibit renders as an empty frame rather than crashing the page. */
export function getDemo(id: string): DemoComponent | null {
  return registry[id] ?? null;
}
