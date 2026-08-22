import {
  listCppEntryCandidates,
  listJavaEntryCandidates,
  type Entry,
  type TestCase,
} from '@visionds/trace-schema';
import { ServerRunner } from '@visionds/runners';
import { runnerFor } from '../runner';

/**
 * Every plausible entry candidate in Python source, in the same order the
 * real AST-based detector in harness.py would produce (top-level defs first,
 * then public methods of `class Solution`). A lightweight regex/indentation
 * scan, not a real parser — good enough for populating the ambiguity
 * dropdown at load time; the actual run always re-detects with the real
 * detector, so a false negative here just means no dropdown appears.
 */
function listPythonEntryCandidates(code: string): Entry[] {
  const lines = code.split('\n');
  const funcs: Entry[] = [];
  const methods: Entry[] = [];

  let inSolution = false;
  let solutionIndent = -1;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '');
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1]!.length : 0;
    const trimmed = line.trim();

    if (/^class\s+Solution\b/.test(trimmed) && indent === 0) {
      inSolution = true;
      solutionIndent = indent;
      continue;
    }
    if (inSolution && trimmed && indent <= solutionIndent) {
      inSolution = false;
    }

    const defMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (!defMatch) continue;
    const name = defMatch[1]!;

    if (indent === 0) {
      funcs.push({ name, className: null });
    } else if (inSolution && !name.startsWith('_')) {
      methods.push({ name, className: 'Solution' });
    }
  }

  return [...funcs, ...methods];
}

/**
 * Collapse candidates that are the same choice.
 *
 * `Entry` identifies a function by name and class only, so Java overloads
 * (`public int f(int)` and `public int f(String)`) arrive as two entries that
 * are indistinguishable — same label in the dropdown, duplicate React keys,
 * and picking either resolves to the same first match downstream. One option
 * is the honest representation.
 */
function dedupeEntries(entries: Entry[]): Entry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const id = `${e.className ?? ''}.${e.name}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** The default Python call-site, matching harness.py's `default_system_code`. */
function defaultPythonSystemCode(entry: Entry): string {
  const call = entry.className
    ? `${entry.className}().${entry.name}(*__vds_args__)`
    : `${entry.name}(*__vds_args__)`;
  return `result = ${call}`;
}

/**
 * The default, student-visible/editable system code for `language` + the
 * current student code, optionally targeting a specific entry candidate
 * (a dropdown pick). Python is computed synchronously client-side (no
 * Pyodide boot needed just for this); C++/Java round-trip through the trace
 * service, which already owns the literal-generation logic — duplicating it
 * into the browser bundle isn't worth the size for a UI nicety.
 */
export async function getDefaultSystemCode(
  language: string,
  studentCode: string,
  entryOverride?: Entry,
): Promise<{ systemCode: string; entry: Entry; candidates: Entry[] }> {
  if (language === 'python') {
    const candidates = dedupeEntries(listPythonEntryCandidates(studentCode));
    if (candidates.length === 0) {
      return { systemCode: '', entry: { name: '', className: null }, candidates: [] };
    }
    const entry =
      (entryOverride && candidates.find((c) => c.name === entryOverride.name)) ??
      candidates[candidates.length - 1]!;
    return { systemCode: defaultPythonSystemCode(entry), entry, candidates };
  }

  // C++/Java candidate listing is pure string parsing (no Node APIs), safe
  // to run client-side directly via the same trace-schema functions the
  // trace service uses server-side for the real default — only the
  // literal-generation for the call-site text stays server-side.
  const candidates: Entry[] = dedupeEntries(
    language === 'java'
      ? listJavaEntryCandidates(studentCode).map((c) => ({ name: c.name, className: 'Solution' }))
      : listCppEntryCandidates(studentCode),
  );

  const runner = runnerFor(language);
  if (!(runner instanceof ServerRunner)) {
    throw new Error(`no system-code generator for language: ${language}`);
  }
  const { systemCode, entry } = await runner.fetchDefaultSystemCode(studentCode, entryOverride);
  return { systemCode, entry, candidates };
}

export type { Entry, TestCase };
