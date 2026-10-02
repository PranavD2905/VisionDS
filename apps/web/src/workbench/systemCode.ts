import { policyFor } from '@visionds/entry-policy';
import type { Entry, TestCase } from '@visionds/trace-schema';

/**
 * The default call site for `language` + the current student code, optionally
 * targeting a specific candidate (a picker choice), plus the candidates the
 * picker offers — the roots, the candidates nothing else calls. Synchronous
 * under the hood: the shared entry-point policy parses all three languages in
 * the browser, so nothing round-trips to the trace service.
 */
export async function getDefaultSystemCode(
  language: string,
  studentCode: string,
  entryOverride?: Entry,
): Promise<{ systemCode: string; entry: Entry; candidates: Entry[] }> {
  const policy = policyFor(language);
  if (!policy) throw new Error(`no entry-point policy for language: ${language}`);
  const analysis = policy.analyze(studentCode);
  const picked = entryOverride
    ? analysis.candidates.filter(
        (c) => c.name === entryOverride.name && c.className === entryOverride.className,
      ).at(-1)
    : undefined;
  const target = picked ?? analysis.defaultEntry;
  return {
    systemCode: policy.defaultCallSite(studentCode, target),
    entry: { name: target.name, className: target.className },
    candidates: analysis.roots.map((c) => ({ name: c.name, className: c.className })),
  };
}

export type { Entry, TestCase };
