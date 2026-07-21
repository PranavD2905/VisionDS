import type { JsonValue } from '@visionds/trace-schema';

export interface CppArg {
  type: string;
  /** A C++ brace/literal initializer for this value. */
  literal: string;
}

/**
 * Infer a C++ type + literal from a parsed JSON argument, using LeetCode's
 * conventional signatures (int, double, bool, string, vector<...>, and nested
 * vectors). This matches the overwhelming majority of problem signatures; an
 * exotic parameter type (unsigned, long long, custom struct) is out of scope
 * for v1 and will surface as a compile error the service reports cleanly.
 */
export function inferCppArg(value: JsonValue): CppArg {
  return { type: cppType(value), literal: cppLiteral(value) };
}

function cppType(v: JsonValue): string {
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v)) return `vector<${elementType(v)}>`;
  // objects as top-level args are not a LeetCode convention
  return 'string';
}

function elementType(arr: JsonValue[]): string {
  const first = arr.find((x) => x !== null);
  if (first === undefined) return 'int'; // empty array — safest default
  return cppType(first);
}

function cppLiteral(v: JsonValue): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return cppStringLit(v);
  if (Array.isArray(v)) return `{${v.map(cppLiteral).join(', ')}}`;
  return cppStringLit(JSON.stringify(v));
}

function cppStringLit(s: string): string {
  const esc = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
  return `"${esc}"`;
}
