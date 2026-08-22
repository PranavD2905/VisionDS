export interface CppEntry {
  /** The function/method name to break on and call. */
  name: string;
  /** Present when the entry is a method of `class Solution`. */
  className: string | null;
}

export interface CppParam {
  /** The parameter's value type, stripped of `const` and reference (`vector<int>`). */
  valueType: string;
  /** True for a non-const reference — the target of an in-place (void) solution. */
  mutableRef: boolean;
}

export interface CppSignature {
  /** `void` for in-place solutions; otherwise the declared return type. */
  returnType: string;
  params: CppParam[];
}

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'do',
  'else', 'case', 'new', 'delete', 'throw',
]);

/**
 * Every plausible entry candidate in source order: `class Solution` methods
 * first (LeetCode's convention), then top-level free functions. Both groups
 * are listed (not just the preferred one) so a caller can surface real
 * ambiguity — e.g. a stray top-level helper written after the intended
 * Solution method — that the "last one wins" default would otherwise hide.
 */
export function listCppEntryCandidates(code: string): CppEntry[] {
  const src = blank(code);
  const out: CppEntry[] = [];

  // Scan for top-level functions over the source with the Solution class
  // body blanked out, so its own methods can't also be double-counted as
  // bogus free functions (which would surface a false "ambiguous entry
  // point" — two candidates that are really the same method).
  let outsideClass = src;

  const solIdx = src.search(/\bclass\s+Solution\b/);
  if (solIdx !== -1) {
    const span = braceSpan(src, solIdx);
    if (span) {
      const [open, close] = span;
      for (const name of functionNames(src.slice(open + 1, close))) {
        if (name !== 'Solution') out.push({ name, className: 'Solution' });
      }
      outsideClass = src.slice(0, open) + ' '.repeat(close - open + 1) + src.slice(close + 1);
    }
  }
  for (const name of functionNames(outsideClass)) {
    out.push({ name, className: null });
  }
  return out;
}

/**
 * Locate the entry point the same way the Python harness does: the last public
 * method of `class Solution` if present, else the last free function. Uses a
 * light structural scan (comments and string/char literals blanked first) that
 * is robust for the stylized code LeetCode problems produce.
 */
export function findCppEntry(code: string): CppEntry {
  const methods = listCppEntryCandidates(code).filter((c) => c.className === 'Solution');
  if (methods.length > 0) return methods[methods.length - 1]!;

  const funcs = listCppEntryCandidates(code).filter((c) => c.className === null);
  if (funcs.length > 0) return funcs[funcs.length - 1]!;

  throw new Error(
    'no entry function found — define a `class Solution` with a public method, or a top-level function',
  );
}

/** Replace comments and string/char literals with spaces, preserving length. */
function blank(code: string): string {
  let out = '';
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      out += code[i] === '\n' ? '\n' : '';
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        out += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i++; // skip the '/'
      out += '  ';
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += ' ';
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') i++;
        out += ' ';
        i++;
      }
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

/** [open, close] indices of the first `{` after `from` and its matching `}`. */
function braceSpan(src: string, from: number): [number, number] | null {
  const open = src.indexOf('{', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return [open, i];
    }
  }
  return [open, src.length - 1];
}

/** Body between the first `{` after `from` and its matching `}`. */
function braceBody(src: string, from: number): string | null {
  const span = braceSpan(src, from);
  return span ? src.slice(span[0] + 1, span[1]) : null;
}

/** Names of function/method definitions (a signature immediately followed by a body). */
function functionNames(src: string): string[] {
  const names: string[] = [];
  const re = /\b([A-Za-z_]\w*)\s*\([^;{}()]*\)\s*(?:const\s*)?(?:noexcept\s*)?\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1]!;
    if (!KEYWORDS.has(name)) names.push(name);
  }
  return names;
}

const LEADING_QUALIFIERS = /^(?:public|private|protected)\s*:\s*|^\b(?:static|virtual|inline|constexpr|explicit|friend)\b\s*/;

/**
 * Best-effort extraction of the entry's return type and parameter types, so the
 * harness can declare arguments with the student's exact types (vector<char>,
 * long long, …) and detect void in-place solutions. Returns null when the
 * signature can't be parsed confidently; the harness then falls back to
 * inferring types from the JSON values.
 */
export function extractSignature(code: string, entry: CppEntry): CppSignature | null {
  const src = blank(code);
  let region = src;
  if (entry.className) {
    const idx = src.search(/\bclass\s+Solution\b/);
    if (idx === -1) return null;
    const body = braceBody(src, idx);
    if (body === null) return null;
    region = body;
  }

  // Find the definition of the entry: `name ( ... ) {`.
  const nameRe = new RegExp(`\\b${escapeRe(entry.name)}\\s*\\(`, 'g');
  let match: RegExpExecArray | null;
  let defOpen = -1;
  let nameStart = -1;
  while ((match = nameRe.exec(region)) !== null) {
    const open = region.indexOf('(', match.index);
    const close = matchParen(region, open);
    if (close === -1) continue;
    if (/^\s*(?:const\s*)?(?:noexcept\s*)?\{/.test(region.slice(close + 1, close + 40))) {
      defOpen = open;
      nameStart = match.index;
      break;
    }
  }
  if (defOpen === -1) return null;

  const close = matchParen(region, defOpen);
  const paramStr = region.slice(defOpen + 1, close);

  // Return type: the token run immediately before the name.
  let i = nameStart - 1;
  while (i >= 0 && /\s/.test(region[i]!)) i--;
  let j = i;
  while (j >= 0 && /[\w:<>,*&~ ]/.test(region[j]!)) j--;
  let returnType = region.slice(j + 1, i + 1).trim();
  while (LEADING_QUALIFIERS.test(returnType)) returnType = returnType.replace(LEADING_QUALIFIERS, '');
  returnType = returnType.trim();

  const params = splitTopLevel(paramStr)
    .map((p) => p.trim())
    .filter((p) => p && p !== 'void')
    .map(parseParam);

  return { returnType, params };
}

function parseParam(param: string): CppParam {
  const nameMatch = param.match(/([A-Za-z_]\w*)\s*$/);
  const typePart = nameMatch ? param.slice(0, param.length - nameMatch[1]!.length) : param;
  const mutableRef = /&/.test(typePart) && !/\bconst\b/.test(typePart);
  const valueType = typePart
    .replace(/\bconst\b/g, '')
    .replace(/[&*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { valueType, mutableRef };
}

/** Split a parameter list on top-level commas (ignoring those inside <> or ()). */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<' || c === '(') depth++;
    else if (c === '>' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
