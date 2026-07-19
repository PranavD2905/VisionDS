import type { JsonValue } from '@visionds/trace-schema';

/** Compact display form of a snapshot value. */
export function fmt(v: JsonValue | undefined): string {
  if (v === undefined) return '';
  return JSON.stringify(v);
}
