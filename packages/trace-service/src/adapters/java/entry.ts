export interface JavaParam {
  /** Full declared type, e.g. `int[]`, `List<Integer>`, `ListNode`. */
  type: string;
  name: string;
}

export interface JavaEntry {
  name: string;
  /** `void` for in-place solutions, else the declared return type. */
  returnType: string;
  params: JavaParam[];
}

/**
 * Find the entry point: the last public method of `class Solution` (LeetCode's
 * convention), with its return type and parameter types. Java is regular enough
 * that a structural scan over the blanked source is reliable.
 */
export function findJavaEntry(code: string): JavaEntry {
  const src = blank(code);
  const solIdx = src.search(/\bclass\s+Solution\b/);
  if (solIdx === -1) throw new Error('no `class Solution` found — LeetCode Java uses `class Solution`');
  const body = braceBody(src, solIdx);
  if (body === null) throw new Error('could not parse `class Solution`');

  const re = /\bpublic\s+(?:static\s+|final\s+)*([\w<>\[\],.\s]+?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) matches.push(m);
  if (matches.length === 0) throw new Error('`class Solution` has no public method');

  const chosen = matches[matches.length - 1]!;
  return {
    returnType: chosen[1]!.trim().replace(/\s+/g, ' '),
    name: chosen[2]!,
    params: splitTopLevel(chosen[3]!)
      .map((p) => p.trim())
      .filter(Boolean)
      .map(parseParam),
  };
}

function parseParam(param: string): JavaParam {
  const cleaned = param.replace(/\bfinal\b/g, '').trim();
  const nameMatch = cleaned.match(/([A-Za-z_]\w*)\s*((?:\[\])*)\s*$/);
  const name = nameMatch ? nameMatch[1]! : cleaned;
  const trailingArray = nameMatch ? nameMatch[2]! : '';
  let type = nameMatch ? cleaned.slice(0, cleaned.length - nameMatch[0]!.length) : cleaned;
  type = (type + trailingArray).replace(/\s+/g, ' ').trim();
  return { type, name };
}

/** Split a parameter list on top-level commas (ignoring those inside <> or []). */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<' || c === '[' || c === '(') depth++;
    else if (c === '>' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/** Replace comments and string/char literals with spaces (structure preserved). */
function blank(code: string): string {
  let out = '';
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const next = code[i + 1];
    if (c === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        out += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i++;
      out += '  ';
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out += ' ';
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') {
          out += ' ';
          i++;
        }
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
