import type { JsonValue } from '@visionds/trace-schema';

/** Order-insensitive for object keys, order-sensitive for arrays (they're lists). */
export function normalize(v: JsonValue): JsonValue {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]!);
    return out;
  }
  return v;
}

export function valuesEqual(a: JsonValue, b: JsonValue): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
