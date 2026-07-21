import type { JsonValue } from '@visionds/trace-schema';

/**
 * LeetCode-style testcase parsing, matching the Python harness (_parse_args /
 * _parse_value): one argument per line, each a JSON literal, with an optional
 * `name = literal` prefix that is ignored. Kept in TS so every server-side
 * language runner parses input identically to the Pyodide runner.
 */
export function parseValue(text: string): JsonValue {
  const t = text.trim();
  try {
    return JSON.parse(t) as JsonValue;
  } catch {
    throw new Error(`could not parse value: ${JSON.stringify(t)}`);
  }
}

export function parseArgs(input: string): JsonValue[] {
  const args: JsonValue[] = [];
  for (const raw of input.trim().split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    let expr = line;
    if (eq > 0) {
      const head = line.slice(0, eq).trim();
      if (/^[A-Za-z_]\w*$/.test(head)) expr = line.slice(eq + 1).trim();
    }
    args.push(parseValue(expr));
  }
  return args;
}
