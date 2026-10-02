import { beforeEach, describe, expect, it } from 'vitest';
import { langById } from '../languages';
import { readDraft, writeDraft } from './draft';
import { deriveSource, sourceReducer, type SourceAction, type SourceState } from './source';

const CASES = [{ input: '[1]\n2', expected: '[0]' }];

function state(code: string, language = 'python'): SourceState {
  return { language, code, cases: CASES, callSite: { kind: 'auto' }, problem: null };
}

const apply = (s: SourceState, ...actions: SourceAction[]) => actions.reduce(sourceReducer, s);

const TWO_PROBLEMS = `def isPalindrome(s):
    return s == s[::-1]

class Solution:
    def twoSum(self, nums, target):
        return [0, 1]
`;

describe('deriveSource', () => {
  it('follows code edits while the call site is auto', () => {
    const s = state('def twoSum(nums, target):\n    return [0]\n');
    expect(deriveSource(s).callSite).toBe('result = twoSum(*__vds_args__)');
    const renamed = apply(s, { type: 'editCode', code: 'def pairSum(nums, target):\n    return [0]\n' });
    expect(deriveSource(renamed).callSite).toBe('result = pairSum(*__vds_args__)');
    expect(deriveSource(renamed).entry).toEqual({ name: 'pairSum', className: null });
  });

  it('never offers a helper written after the entry, nor a nested closure, as a choice', () => {
    const code = `class Solution:
    def maxDepth(self, root):
        def walk(node):
            return 0 if node is None else 1 + max(walk(node.left), walk(node.right))
        return self.depth(root) + walk(root)

    def depth(self, node):
        return 0
`;
    const view = deriveSource(state(code));
    expect(view.entry).toEqual({ name: 'maxDepth', className: 'Solution' });
    expect(view.showPicker).toBe(false);
    expect(view.problem).toBeNull();
  });

  it('offers the roots of a two-problem file and keeps a pick across code edits', () => {
    const s = apply(state(TWO_PROBLEMS), {
      type: 'pickEntry',
      entry: { name: 'isPalindrome', className: null },
    });
    const view = deriveSource(s);
    expect(view.showPicker).toBe(true);
    expect(view.candidates).toEqual([
      { name: 'isPalindrome', className: null },
      { name: 'twoSum', className: 'Solution' },
    ]);
    expect(view.callSite).toBe('result = isPalindrome(*__vds_args__)');

    // Regression: a pick used to revert ~500 ms later when a debounced rescan
    // fired with the entry it had captured before the pick.
    const edited = apply(s, { type: 'editCode', code: TWO_PROBLEMS + '\n# a comment\n' });
    expect(deriveSource(edited).entry).toEqual({ name: 'isPalindrome', className: null });
  });

  it('lets a pick lapse to the default when its function is deleted', () => {
    const s = apply(
      state(TWO_PROBLEMS),
      { type: 'pickEntry', entry: { name: 'isPalindrome', className: null } },
      { type: 'editCode', code: TWO_PROBLEMS.replace(/^def isPalindrome[\s\S]*?\n\n/, '') },
    );
    const view = deriveSource(s);
    expect(view.entry).toEqual({ name: 'twoSum', className: 'Solution' });
    expect(view.problem).toBeNull();
  });

  it('keeps an edited call site across code edits and reports what is wrong with it', () => {
    const s = apply(state(TWO_PROBLEMS), {
      type: 'editCallSite',
      text: 'result = nope(*__vds_args__)',
    });
    const view = deriveSource(apply(s, { type: 'editCode', code: TWO_PROBLEMS + '\n' }));
    expect(view.callSite).toBe('result = nope(*__vds_args__)');
    expect(view.entry).toBeNull();
    expect(view.problem).toMatch(/doesn't call any function from your code/);
  });

  it('shows an edited call site that targets a helper as the selected choice', () => {
    const code = `def helper(x):
    return x

def solve(x):
    return helper(x)
`;
    const view = deriveSource(
      apply(state(code), { type: 'editCallSite', text: 'result = helper(*__vds_args__)' }),
    );
    expect(view.entry).toEqual({ name: 'helper', className: null });
    expect(view.candidates).toEqual([
      { name: 'solve', className: null },
      { name: 'helper', className: null },
    ]);
  });

  it('goes back to the generated call site on reset', () => {
    const s = apply(
      state(TWO_PROBLEMS),
      { type: 'editCallSite', text: 'result = isPalindrome(*__vds_args__)' },
      { type: 'resetCallSite' },
    );
    expect(deriveSource(s).entry).toEqual({ name: 'twoSum', className: 'Solution' });
  });

  it('reports a file with no entry point instead of producing an empty call site silently', () => {
    const view = deriveSource(state('x = 1\n'));
    expect(view.callSite).toBe('');
    expect(view.problem).toMatch(/No entry point found/);
  });

  it('derives C++ and Java call sites in the browser, with no trace-service round trip', () => {
    for (const lang of ['cpp', 'java']) {
      const view = deriveSource(state(langById(lang).starterCode, lang));
      expect(view.problem).toBeNull();
      expect(view.entry?.className).toBe('Solution');
      expect(view.callSite).toMatch(/result = .*Solution\(\)\.\w+\(a0, a1\);/);
    }
  });
});

describe('sourceReducer load', () => {
  it('resets the call site to auto and falls back to the starter for empty input', () => {
    const s = apply(
      state(TWO_PROBLEMS),
      { type: 'editCallSite', text: 'whatever' },
      { type: 'load', language: 'java', code: '', cases: [], problem: null },
    );
    expect(s.callSite).toEqual({ kind: 'auto' });
    expect(s.code).toBe(langById('java').starterCode);
    expect(s.cases).toEqual(langById('java').starterCases);
  });
});

describe('draft persistence', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  it('round-trips a picked entry, so a refresh does not revert it', () => {
    const s = apply(state(TWO_PROBLEMS), {
      type: 'pickEntry',
      entry: { name: 'isPalindrome', className: null },
    });
    writeDraft(s);
    expect(readDraft()).toEqual(s);
  });

  it('round-trips an edited call site', () => {
    const s = apply(state(TWO_PROBLEMS), { type: 'editCallSite', text: 'result = 1' });
    writeDraft(s);
    expect(readDraft()?.callSite).toEqual({ kind: 'edited', text: 'result = 1' });
  });

  it('carries a v1 draft over with its call site reset to auto', () => {
    store.set(
      'visionds.workbench.draft.v1',
      JSON.stringify({
        language: 'cpp',
        code: 'int f(int x) { return x; }',
        cases: CASES,
        systemCode: 'int main(){\n  // ---- arguments ----\n}',
        systemCodeDirty: true,
        problem: null,
      }),
    );
    const d = readDraft();
    expect(d?.code).toBe('int f(int x) { return x; }');
    expect(d?.callSite).toEqual({ kind: 'auto' });
  });

  it('treats an unrecognized call-site shape as auto, and garbage as no draft', () => {
    store.set(
      'visionds.workbench.draft.v2',
      JSON.stringify({ ...state(TWO_PROBLEMS), callSite: { kind: 'bogus' } }),
    );
    expect(readDraft()?.callSite).toEqual({ kind: 'auto' });
    store.set('visionds.workbench.draft.v2', '{not json');
    expect(readDraft()).toBeNull();
  });
});
