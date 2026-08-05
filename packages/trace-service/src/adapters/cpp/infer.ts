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

const INT_TYPES = new Set([
  'int', 'long', 'long long', 'short', 'unsigned', 'unsigned int', 'unsigned long',
  'unsigned long long', 'size_t', 'int32_t', 'int64_t', 'uint32_t', 'uint64_t', 'char',
]);
const FLOAT_TYPES = new Set(['double', 'float', 'long double']);

/**
 * A C++ literal for `value` targeting a known declared type (from the student's
 * signature). This is what lets `vector<char>`, `string`, `long long`, etc. bind
 * correctly — the JSON value alone can't distinguish char from string. Falls
 * back to plain JSON inference when the type isn't one we model.
 */
export function cppLiteralForType(rawType: string, value: JsonValue): string {
  const type = rawType.replace(/^std::/, '').trim();
  const elem = vectorElement(type);
  if (elem !== null && Array.isArray(value)) {
    return `{${value.map((v) => cppLiteralForType(elem, v)).join(', ')}}`;
  }
  if (type === 'char' && typeof value === 'string') {
    return cppCharLit(value);
  }
  if ((type === 'string' || type === 'char') && typeof value === 'string') {
    return type === 'char' ? cppCharLit(value) : cppStringLit(value);
  }
  if (type === 'bool' && typeof value === 'boolean') return value ? 'true' : 'false';
  if (INT_TYPES.has(type) && typeof value === 'number') return String(Math.trunc(value));
  if (FLOAT_TYPES.has(type) && typeof value === 'number') {
    return Number.isInteger(value) ? `${value}.0` : String(value);
  }
  return cppLiteral(value); // unknown type — infer from the value
}

/** The element type of a vector<...> type, else null. */
function vectorElement(type: string): string | null {
  const m = type.match(/vector\s*</);
  if (!m) return null;
  const open = type.indexOf('<', m.index);
  let depth = 0;
  for (let i = open; i < type.length; i++) {
    if (type[i] === '<') depth++;
    else if (type[i] === '>') {
      depth--;
      if (depth === 0) return type.slice(open + 1, i).replace(/^std::/, '').trim();
    }
  }
  return null;
}

function cppCharLit(s: string): string {
  const c = s.length > 0 ? s[0]! : ' ';
  if (c === "'") return "'\\''";
  if (c === '\\') return "'\\\\'";
  if (c === '\n') return "'\\n'";
  if (c === '\t') return "'\\t'";
  return `'${c}'`;
}
