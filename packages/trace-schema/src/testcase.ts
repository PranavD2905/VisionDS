import {
  type Entry,
  type ExecutionTrace,
  ExecutionTraceSchema,
  type JsonValue,
  type TestCase,
} from './schema';

/**
 * A problem with the submission itself — an unparseable testcase, no entry
 * point, a call site calling zero or several candidates, an argument-count
 * mismatch. Every runner turns it into an `error` verdict trace, never a
 * service failure. See CONTEXT.md, "User Error".
 */
export class SubmissionError extends Error {
  override name = 'SubmissionError';
}

/**
 * Parse one testcase value: JSON first, then the Python literal forms
 * students paste from LeetCode or their own tests — `True`/`False`/`None`,
 * single-quoted strings, tuples (as lists), trailing commas. One parser for
 * every language, so `['a','b']` means the same thing in Python, C++ and Java.
 */
export function parseLiteral(text: string): JsonValue {
  const t = text.trim();
  try {
    return JSON.parse(t) as JsonValue;
  } catch {
    // not JSON — fall through to the literal parser
  }
  try {
    const p = new LiteralParser(t);
    const value = p.value();
    p.end();
    return value;
  } catch {
    throw new SubmissionError(`Could not parse the testcase value ${JSON.stringify(t)}.`);
  }
}

/** One argument per line, LeetCode style; a `name = value` prefix is dropped. */
export function parseArgs(input: string): JsonValue[] {
  const args: JsonValue[] = [];
  for (const raw of input.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([A-Za-z_]\w*)\s*=(?!=)\s*(.*)$/.exec(line);
    args.push(parseLiteral(m ? m[2]! : line));
  }
  return args;
}

export function parseTestCase(tc: TestCase): { args: JsonValue[]; expected: JsonValue } {
  return { args: parseArgs(tc.input), expected: parseLiteral(tc.expected) };
}

/** The trace for a run that could not start: no steps, an `error` verdict. */
export function userErrorTrace(opts: {
  language: string;
  code: string;
  testCase: TestCase;
  message: string;
  systemCode?: string;
  entry?: Entry;
}): ExecutionTrace {
  return ExecutionTraceSchema.parse({
    language: opts.language,
    code: opts.code,
    ...(opts.systemCode !== undefined ? { systemCode: opts.systemCode } : {}),
    ...(opts.entry ? { entry: opts.entry } : {}),
    testCase: opts.testCase,
    steps: [],
    result: { ...opts.testCase, verdict: 'error', message: opts.message },
  });
}

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '0': '\0',
};

/** Recursive-descent parser for the Python literal subset JSON can carry. */
class LiteralParser {
  private i = 0;
  constructor(private readonly s: string) {}

  end() {
    this.ws();
    if (this.i !== this.s.length) throw new Error('trailing input');
  }

  value(): JsonValue {
    this.ws();
    const c = this.s[this.i];
    if (c === '[') return this.seq(']');
    if (c === '(') return this.seq(')');
    if (c === '{') return this.dict();
    if (c === '"' || c === "'") return this.str();
    const rest = this.s.slice(this.i);
    const word = /^[A-Za-z_]\w*/.exec(rest)?.[0];
    if (word !== undefined) {
      this.i += word.length;
      if (word === 'True' || word === 'true') return true;
      if (word === 'False' || word === 'false') return false;
      if (word === 'None' || word === 'null') return null;
      throw new Error(`unknown name ${word}`);
    }
    const num = /^[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][-+]?\d+)?/.exec(rest)?.[0];
    if (num !== undefined) {
      this.i += num.length;
      const n = Number(num.replace(/_/g, ''));
      if (Number.isNaN(n)) throw new Error('bad number');
      return n;
    }
    throw new Error('unexpected input');
  }

  private seq(close: string): JsonValue[] {
    this.i++; // the opening bracket
    const out: JsonValue[] = [];
    for (;;) {
      this.ws();
      if (this.s[this.i] === close) {
        this.i++;
        return out;
      }
      out.push(this.value());
      this.ws();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== close) throw new Error(`expected , or ${close}`);
    }
  }

  private dict(): { [key: string]: JsonValue } {
    this.i++; // {
    const out: { [key: string]: JsonValue } = {};
    for (;;) {
      this.ws();
      if (this.s[this.i] === '}') {
        this.i++;
        return out;
      }
      const key = this.value();
      if (typeof key !== 'string' && typeof key !== 'number') throw new Error('bad key');
      this.ws();
      if (this.s[this.i++] !== ':') throw new Error('expected :');
      out[String(key)] = this.value();
      this.ws();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== '}') throw new Error('expected , or }');
    }
  }

  private str(): string {
    const quote = this.s[this.i++];
    let out = '';
    while (this.i < this.s.length) {
      const c = this.s[this.i++]!;
      if (c === quote) return out;
      if (c !== '\\') {
        out += c;
        continue;
      }
      const e = this.s[this.i++] ?? '';
      if (e in ESCAPES) out += ESCAPES[e];
      else if (e === 'u') {
        out += String.fromCharCode(parseInt(this.s.slice(this.i, this.i + 4), 16));
        this.i += 4;
      } else out += `\\${e}`;
    }
    throw new Error('unterminated string');
  }

  private ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }
}
