export interface CppEntry {
  /** The function/method name to break on and call. */
  name: string;
  /** Present when the entry is a method of `class Solution`. */
  className: string | null;
}

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'do',
  'else', 'case', 'new', 'delete', 'throw',
]);

/**
 * Locate the entry point the same way the Python harness does: the last public
 * method of `class Solution` if present, else the last free function. Uses a
 * light structural scan (comments and string/char literals blanked first) that
 * is robust for the stylized code LeetCode problems produce.
 */
export function findCppEntry(code: string): CppEntry {
  const src = blank(code);

  const solIdx = src.search(/\bclass\s+Solution\b/);
  if (solIdx !== -1) {
    const body = braceBody(src, solIdx);
    if (body) {
      const methods = functionNames(body).filter((n) => n !== 'Solution');
      if (methods.length > 0) {
        return { name: methods[methods.length - 1]!, className: 'Solution' };
      }
    }
  }

  const funcs = functionNames(src);
  if (funcs.length > 0) {
    return { name: funcs[funcs.length - 1]!, className: null };
  }
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

/** Body between the first `{` after `from` and its matching `}`. */
function braceBody(src: string, from: number): string | null {
  const open = src.indexOf('{', from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
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
