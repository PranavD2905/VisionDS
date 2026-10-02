import { describe, expect, it } from 'vitest';
import { cppPolicy, javaPolicy, label, policyFor, pythonPolicy, SubmissionError } from './index';
import type { EntryPolicy } from './types';

/**
 * The same submission shapes, written in each language. Every row is the
 * contract all three policies share: one table, so the languages can't drift
 * apart again.
 */
interface Scenario {
  name: string;
  code: Record<'python' | 'cpp' | 'java', string>;
  candidates: string[];
  roots: string[];
  defaultEntry: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'a helper written after the entry is not the default',
    code: {
      python: `class Solution:
    def maxDepth(self, root):
        return self.depth(root)

    def depth(self, node):
        return 0 if node is None else 1 + max(self.depth(node.left), self.depth(node.right))
`,
      cpp: `class Solution {
public:
    int maxDepth(TreeNode* root) { return depth(root); }
    int depth(TreeNode* n) { return n ? 1 + max(depth(n->left), depth(n->right)) : 0; }
};
`,
      java: `class Solution {
    public int maxDepth(TreeNode root) { return depth(root); }
    public int depth(TreeNode n) { return n == null ? 0 : 1 + Math.max(depth(n.left), depth(n.right)); }
}
`,
    },
    candidates: ['Solution.maxDepth', 'Solution.depth'],
    roots: ['Solution.maxDepth'],
    defaultEntry: 'Solution.maxDepth',
  },
  {
    name: 'a helper written before the entry is not the default either',
    code: {
      python: `def helper(x):
    return x + 1

class Solution:
    def solve(self, n):
        return helper(n)
`,
      cpp: `int helper(int x) { return x + 1; }
class Solution {
public:
    int solve(int n) { return helper(n); }
};
`,
      java: `class Solution {
    public int helper(int x) { return x + 1; }
    public int solve(int n) { return helper(n); }
}
`,
    },
    candidates: ['helper', 'Solution.solve'],
    roots: ['Solution.solve'],
    defaultEntry: 'Solution.solve',
  },
  {
    name: 'two problems in one file: both are roots, the Solution method is the default',
    code: {
      python: `def isPalindrome(s):
    return s == s[::-1]

class Solution:
    def twoSum(self, nums, target):
        return [0, 1]
`,
      cpp: `bool isPalindrome(string s) { return true; }
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) { return {0, 1}; }
};
`,
      java: `class Solution {
    public boolean isPalindrome(String s) { return true; }
    public int[] twoSum(int[] nums, int target) { return new int[]{0, 1}; }
}
`,
    },
    candidates: ['isPalindrome', 'Solution.twoSum'],
    roots: ['isPalindrome', 'Solution.twoSum'],
    defaultEntry: 'Solution.twoSum',
  },
  {
    name: 'self-recursion keeps the function a root',
    code: {
      python: `def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
`,
      cpp: `int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
`,
      java: `class Solution {
    public int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
}
`,
    },
    candidates: ['fib'],
    roots: ['fib'],
    defaultEntry: 'fib',
  },
  {
    name: 'mutual recursion: every candidate is called, so all of them are roots',
    code: {
      python: `def isEven(n):
    return True if n == 0 else isOdd(n - 1)

def isOdd(n):
    return False if n == 0 else isEven(n - 1)
`,
      cpp: `bool isOdd(int n);
bool isEven(int n) { return n == 0 ? true : isOdd(n - 1); }
bool isOdd(int n) { return n == 0 ? false : isEven(n - 1); }
`,
      java: `class Solution {
    public boolean isEven(int n) { return n == 0 || isOdd(n - 1); }
    public boolean isOdd(int n) { return n != 0 && isEven(n - 1); }
}
`,
    },
    candidates: ['isEven', 'isOdd'],
    roots: ['isEven', 'isOdd'],
    defaultEntry: 'isOdd',
  },
  {
    name: 'private helpers are never candidates',
    code: {
      python: `class Solution:
    def climb(self, n):
        return self._ways(n)

    def _ways(self, n):
        return 1
`,
      cpp: `class Solution {
    int ways(int n) { return 1; }
public:
    int climb(int n) { return ways(n); }
};
`,
      java: `class Solution {
    public int climb(int n) { return ways(n); }
    private int ways(int n) { return 1; }
}
`,
    },
    candidates: ['Solution.climb'],
    roots: ['Solution.climb'],
    defaultEntry: 'Solution.climb',
  },
];

const POLICIES = { python: pythonPolicy, cpp: cppPolicy, java: javaPolicy } as const;

/** Java methods all belong to Solution; the shared rows name free functions bare. */
function names(lang: keyof typeof POLICIES, labels: string[]): string[] {
  return lang === 'java' ? labels.map((l) => (l.includes('.') ? l : `Solution.${l}`)) : labels;
}

describe.each(Object.keys(POLICIES) as (keyof typeof POLICIES)[])('%s policy', (lang) => {
  const policy: EntryPolicy = POLICIES[lang];

  describe.each(SCENARIOS)('$name', (s) => {
    const analysis = policy.analyze(s.code[lang]);

    it('lists the candidates in source order', () => {
      expect(analysis.candidates.map(label)).toEqual(names(lang, s.candidates));
    });

    it('finds the roots', () => {
      expect(analysis.roots.map(label)).toEqual(names(lang, s.roots));
    });

    it('picks the default entry', () => {
      expect(label(analysis.defaultEntry)).toBe(names(lang, [s.defaultEntry])[0]);
    });

    it('resolves its own default call site back to the default entry', () => {
      const callSite = policy.defaultCallSite(s.code[lang]);
      const entry = policy.resolveCallSite(s.code[lang], callSite);
      expect(label(entry)).toBe(label(analysis.defaultEntry));
    });

    it('resolves a call site generated for every other candidate to that candidate', () => {
      for (const c of analysis.candidates) {
        const callSite = policy.defaultCallSite(s.code[lang], c);
        expect(label(policy.resolveCallSite(s.code[lang], callSite))).toBe(label(c));
      }
    });
  });

  it('reports no candidates as a SubmissionError', () => {
    const code = lang === 'java' ? 'class Nope {}' : lang === 'cpp' ? 'int x = 1;' : 'x = 1\n';
    expect(() => policy.analyze(code)).toThrow(SubmissionError);
  });

  it('reports a duplicate Solution class instead of silently using one', () => {
    const one =
      lang === 'python'
        ? 'class Solution:\n    def a(self):\n        return 1\n'
        : lang === 'cpp'
          ? 'class Solution { public: int a() { return 1; } };\n'
          : 'class Solution { public int a() { return 1; } }\n';
    expect(() => policy.analyze(one + one)).toThrow(/two .*Solution/);
  });
});

describe('resolveCallSite errors', () => {
  const code = `def helper(x):
    return x

class Solution:
    def twoSum(self, nums, target):
        return helper(nums)
`;

  it('rejects a call site that calls none of the candidates', () => {
    expect(() => pythonPolicy.resolveCallSite(code, 'result = Solution().twoSun(*__vds_args__)')).toThrow(
      /doesn't call any function.*Solution\.twoSum/,
    );
  });

  it('rejects a call site that calls two candidates', () => {
    expect(() =>
      pythonPolicy.resolveCallSite(code, 'h = helper(1)\nresult = Solution().twoSum(*__vds_args__)'),
    ).toThrow(/more than one.*helper, twoSum/);
  });

  it('rejects a call site that calls the entry twice', () => {
    expect(() =>
      pythonPolicy.resolveCallSite(
        code,
        'Solution().twoSum(*__vds_args__)\nresult = Solution().twoSum(*__vds_args__)',
      ),
    ).toThrow(/calls twoSum 2 times/);
  });

  it('accepts a call site that calls a helper directly', () => {
    expect(label(pythonPolicy.resolveCallSite(code, 'result = helper(*__vds_args__)'))).toBe('helper');
  });

  it('does not let a bare call reach a method, or a member call reach a free function', () => {
    expect(() => pythonPolicy.resolveCallSite(code, 'result = twoSum(*__vds_args__)')).toThrow(SubmissionError);
    expect(() => pythonPolicy.resolveCallSite(code, 'result = Solution().helper(1)')).toThrow(SubmissionError);
  });

  it('reports an argument-count mismatch against the testcase', () => {
    const callSite = pythonPolicy.defaultCallSite(code);
    expect(pythonPolicy.resolveCallSite(code, callSite, 2).name).toBe('twoSum');
    expect(() => pythonPolicy.resolveCallSite(code, callSite, 3)).toThrow(
      /twoSum takes 2 arguments, but the testcase gives 3/,
    );
  });
});

describe('python specifics', () => {
  it('ignores nested defs, async defs, and defs inside strings', () => {
    const code = `class Solution:
    """def fake(self): pass"""
    def maxDepth(self, root):
        def dfs(node):
            return 0 if node is None else 1 + max(dfs(node.left), dfs(node.right))
        return dfs(root)

    async def later(self):
        pass
`;
    expect(pythonPolicy.analyze(code).candidates.map(label)).toEqual(['Solution.maxDepth']);
  });

  it('counts arity without self, with defaults, keyword-only and varargs', () => {
    const code = `class Solution:
    def a(self, x, y=2, *, z=3):
        pass

    @staticmethod
    def b(x, *rest):
        pass
`;
    const [a, b] = pythonPolicy.analyze(code).candidates;
    expect([a!.minArgs, a!.maxArgs]).toEqual([1, 2]);
    expect([b!.minArgs, b!.maxArgs]).toEqual([1, null]);
  });

  it('renders the default call site', () => {
    expect(pythonPolicy.defaultCallSite('def f(a):\n    return a\n')).toBe('result = f(*__vds_args__)');
    expect(pythonPolicy.defaultCallSite('class Solution:\n    def g(self, a):\n        return a\n')).toBe(
      'result = Solution().g(*__vds_args__)',
    );
  });
});

describe('cpp specifics', () => {
  it('ignores struct constructors, initializer lists and comments', () => {
    const code = `// int fake(int x) { return x; }
struct ListNode { int val; ListNode *next; ListNode(int x) : val(x), next(nullptr) {} };
class Solution {
public:
    Solution() {}
    ListNode* reverseList(ListNode* head) { return head; }
};
`;
    expect(cppPolicy.analyze(code).candidates.map(label)).toEqual(['Solution.reverseList']);
  });

  it('reads parameter types, references and the return type', () => {
    const code = `class Solution {
public:
    void sortColors(vector<int>& nums, const vector<int>& order, long long k = 3) {}
};
`;
    const [c] = cppPolicy.analyze(code).candidates;
    expect(c!.returnType).toBe('void');
    expect(c!.params).toEqual([
      { name: 'nums', type: 'vector<int>', mutableRef: true },
      { name: 'order', type: 'vector<int>', mutableRef: false },
      { name: 'k', type: 'long long', mutableRef: false },
    ]);
    expect([c!.minArgs, c!.maxArgs]).toEqual([2, 3]);
    expect(cppPolicy.defaultCallSite(code)).toBe(
      'Solution().sortColors(a0, a1, a2);\nauto& result = a0;',
    );
  });

  it('honours the access of an out-of-line Solution method', () => {
    const code = `class Solution {
    int hidden(int x);
public:
    int shown(int x);
};
int Solution::hidden(int x) { return x; }
int Solution::shown(int x) { return hidden(x); }
`;
    expect(cppPolicy.analyze(code).candidates.map(label)).toEqual(['Solution.shown']);
  });

  it('resolves overloads by the testcase argument count', () => {
    const code = `class Solution {
public:
    int solve(int a) { return a; }
    int solve(int a, int b) { return a + b; }
};
`;
    const callSite = 'auto result = Solution().solve(a0, a1);';
    expect(cppPolicy.resolveCallSite(code, callSite, 2).params).toHaveLength(2);
    expect(cppPolicy.resolveCallSite(code, callSite, 1).params).toHaveLength(1);
    expect(() => cppPolicy.resolveCallSite(code, callSite, 3)).toThrow(/takes 1 or 2 arguments/);
  });

  it('records the line of each candidate', () => {
    const code = 'int a() { return 1; }\n\nint b() { return a(); }\n';
    expect(cppPolicy.analyze(code).candidates.map((c) => c.line)).toEqual([1, 3]);
  });
});

describe('java specifics', () => {
  it('ignores inner-class methods and constructors, and reads throws clauses', () => {
    const code = `class Solution {
    class TrieNode { public void put(int x) {} }
    public Solution() {}
    public int[] twoSum(final int[] nums, int target) throws Exception { return nums; }
}
class Other { public int z() { return 0; } }
`;
    const { candidates } = javaPolicy.analyze(code);
    expect(candidates.map(label)).toEqual(['Solution.twoSum']);
    expect(candidates[0]!.params).toEqual([
      { name: 'nums', type: 'int[]' },
      { name: 'target', type: 'int' },
    ]);
    expect(candidates[0]!.returnType).toBe('int[]');
  });

  it('renders a void call site against the mutated array', () => {
    const code = 'class Solution {\n    public void rotate(int[][] matrix) {}\n}\n';
    expect(javaPolicy.defaultCallSite(code)).toBe('new Solution().rotate(a0);\nvar result = a0;');
  });

  it('resolves overloads by the testcase argument count', () => {
    const code = `class Solution {
    public int solve(int a) { return a; }
    public int solve(int a, int b) { return a + b; }
}
`;
    const callSite = 'var result = new Solution().solve(a0);';
    expect(javaPolicy.resolveCallSite(code, callSite, 1).params).toHaveLength(1);
    expect(javaPolicy.resolveCallSite(code, callSite, 2).params).toHaveLength(2);
  });
});

describe('policyFor', () => {
  it('knows every runnable language and nothing else', () => {
    expect(policyFor('python')).toBe(pythonPolicy);
    expect(policyFor('cpp')).toBe(cppPolicy);
    expect(policyFor('C++')).toBe(cppPolicy);
    expect(policyFor('java')).toBe(javaPolicy);
    expect(policyFor('rust')).toBeUndefined();
  });
});
