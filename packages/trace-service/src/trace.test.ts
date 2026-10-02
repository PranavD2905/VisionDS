import { describe, expect, it } from 'vitest';
import { buildCallTree } from '@visionds/trace-schema';
import { traceCase } from './trace';

// A buggy two-sum: returns just one index instead of the pair — a wrong answer,
// not a crash, so the verdict is `fail` with a divergence step to jump to.
const BUGGY_TWO_SUM = `class Solution {
public:
    int twoSum(vector<int>& nums, int target) {
        unordered_map<int,int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            int need = target - nums[i];
            if (seen.count(need)) return seen[need];
            seen[nums[i]] = i;
        }
        return -1;
    }
};`;

describe('C++ tracing via lldb', () => {
  it('traces a buggy two-sum end to end', () => {
    const trace = traceCase('cpp', BUGGY_TWO_SUM, { input: '[2,7,11,15]\n9', expected: '[0,1]' });

    expect(trace.language).toBe('cpp');
    expect(trace.steps.length).toBeGreaterThan(3);

    // nums is recorded as a structured array, i as a scalar
    const firstLocals = trace.steps.flatMap((s) => s.locals);
    const nums = firstLocals.find((v) => v.name === 'nums');
    expect(nums?.kind).toBe('array');
    expect(nums?.value).toEqual([2, 7, 11, 15]);
    expect(firstLocals.some((v) => v.name === 'i' && v.kind === 'scalar')).toBe(true);

    // seen appears as a dict (hash map)
    expect(firstLocals.some((v) => v.name === 'seen' && v.kind === 'dict')).toBe(true);

    // returns a single index 0 -> wrong answer -> fail with a divergence step
    const ret = trace.steps.find((s) => s.event === 'return');
    expect(ret?.returnValue).toBe(0);
    expect(trace.result.verdict).toBe('fail');
    expect(trace.result.divergenceStepIndex).toBeTypeOf('number');
  }, 30_000);

  it('handles a void in-place solution (moveZeroes) by comparing the mutated arg', () => {
    const code = `class Solution {
public:
    void moveZeroes(vector<int>& nums) {
        int slow = 0;
        for (int fast = 0; fast < (int)nums.size(); fast++) {
            if (nums[fast] != 0) { swap(nums[slow], nums[fast]); slow++; }
        }
    }
};`;
    const trace = traceCase('cpp', code, { input: '[0,1,0,3,12]', expected: '[1,3,12,0,0]' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.result.actual).toEqual([1, 3, 12, 0, 0]);
    // nums and the two pointers are all visible
    const names = new Set(trace.steps.flatMap((s) => s.locals.map((l) => l.name)));
    expect(names.has('nums')).toBe(true);
    expect(names.has('slow')).toBe(true);
    expect(names.has('fast')).toBe(true);
  }, 30_000);

  it('binds vector<char> from the signature (reverseString)', () => {
    const code = `class Solution {
public:
    void reverseString(vector<char>& s) {
        int l = 0, r = (int)s.size() - 1;
        while (l < r) { swap(s[l], s[r]); l++; r--; }
    }
};`;
    const trace = traceCase('cpp', code, {
      input: '["h","e","l","l","o"]',
      expected: '["o","l","l","e","h"]',
    });
    expect(trace.result.verdict).toBe('pass');
    const s = trace.steps.flatMap((st) => st.locals).find((l) => l.name === 's');
    expect(s?.kind).toBe('array');
  }, 30_000);

  it('exposes a std::stack as an ordered array (valid parentheses)', () => {
    const code = `class Solution {
public:
    bool isValid(string s) {
        stack<char> st;
        for (char c : s) {
            if (c == '(' || c == '[' || c == '{') st.push(c);
            else {
                if (st.empty()) return false;
                char t = st.top(); st.pop();
                if ((c == ')' && t != '(') || (c == ']' && t != '[') || (c == '}' && t != '{'))
                    return false;
            }
        }
        return st.empty();
    }
};`;
    const trace = traceCase('cpp', code, { input: '"()[]{}"', expected: 'true' });
    expect(trace.result.verdict).toBe('pass');
    const st = trace.steps.flatMap((s) => s.locals).find((l) => l.name === 'st');
    expect(st?.kind).toBe('array');
    expect(Array.isArray(st?.value)).toBe(true);
  }, 30_000);

  it('builds and traces a linked list (reverseList)', () => {
    const code = `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        while (head) {
            ListNode* next = head->next;
            head->next = prev;
            prev = head;
            head = next;
        }
        return prev;
    }
};`;
    const trace = traceCase('cpp', code, { input: '[1,2,3,4,5]', expected: '[5,4,3,2,1]' });
    expect(trace.result.verdict).toBe('pass');
    const locals = trace.steps.flatMap((s) => s.locals);
    const head = locals.find((l) => l.name === 'head' && l.kind === 'linkedlist');
    expect(head).toBeDefined();
    expect((head!.value as { vals: number[] }).vals).toEqual([1, 2, 3, 4, 5]);
  }, 30_000);

  it('builds and traces a binary tree (invertTree)', () => {
    const code = `class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;
        TreeNode* l = invertTree(root->left);
        TreeNode* r = invertTree(root->right);
        root->left = r;
        root->right = l;
        return root;
    }
};`;
    const trace = traceCase('cpp', code, { input: '[4,2,7,1,3,6,9]', expected: '[4,7,2,9,6,3,1]' });
    expect(trace.result.verdict).toBe('pass');
    const root = trace.steps.flatMap((s) => s.locals).find((l) => l.name === 'root' && l.kind === 'tree');
    expect(root).toBeDefined();
    const v = root!.value as { val: number };
    expect(v.val).toBe(4);
  }, 30_000);

  it('accepts a TreeNode arg with a non-tree return (maxDepth)', () => {
    const code = `class Solution {
public:
    int maxDepth(TreeNode* root) {
        if (!root) return 0;
        return 1 + max(maxDepth(root->left), maxDepth(root->right));
    }
};`;
    const trace = traceCase('cpp', code, {
      input: '[3,9,20,null,null,15,7]',
      expected: '3',
    });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.steps.flatMap((s) => s.locals).some((l) => l.kind === 'tree')).toBe(true);
  }, 30_000);

  it('reports a compile error as an error verdict, not a crash', () => {
    const trace = traceCase('cpp', 'class Solution { public: int f(int x){ return y; } };', {
      input: '3',
      expected: '3',
    });
    expect(trace.result.verdict).toBe('error');
    expect(trace.result.message).toMatch(/error:/);
    expect(trace.steps).toHaveLength(0);
  }, 30_000);

  it('steps an entry that takes plain int scalars', () => {
    // Regression: the bare-name breakpoint on `add` also matched libc++
    // symbols, stopped there first, and stepped out of main with nothing
    // recorded — the run then hit the step cap with zero steps.
    const code = `class Solution {
public:
    int add(int a, int b) {
        int sum = a + b;
        return sum;
    }
};`;
    const trace = traceCase('cpp', code, { input: '2\n3', expected: '5' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.entry).toEqual({ name: 'add', className: 'Solution' });
    expect(trace.steps.length).toBeGreaterThan(1);
  }, 30_000);

  it('traces a private helper written after the entry, and names the final return after the entry', () => {
    const code = `class Solution {
public:
    int maxDepth(TreeNode* root) {
        return depth(root);
    }
private:
    int depth(TreeNode* n) {
        if (!n) return 0;
        return 1 + max(depth(n->left), depth(n->right));
    }
};`;
    const trace = traceCase('cpp', code, { input: '[3,9,20,null,null,15,7]', expected: '3' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.entry).toEqual({ name: 'maxDepth', className: 'Solution' });
    expect(new Set(trace.steps.map((s) => s.func))).toEqual(new Set(['maxDepth', 'depth']));
    expect(trace.steps.at(-1)).toMatchObject({ event: 'return', func: 'maxDepth', callDepth: 0 });
    // one root: the entry, with the helper calls beneath it
    const tree = buildCallTree(trace.steps);
    expect(tree.roots).toHaveLength(1);
    expect(tree.nodes[tree.roots[0]!]!.func).toBe('maxDepth');
  }, 30_000);

  it('records frames, the caller strip, and aliases through a reference parameter', () => {
    const code = `class Solution {
public:
    int total(vector<int>& nums) {
        bump(nums);
        int s = 0;
        for (int x : nums) s += x;
        return s;
    }
    void bump(vector<int>& arr) {
        for (int i = 0; i < (int)arr.size(); i++) arr[i] += 1;
    }
};`;
    const trace = traceCase('cpp', code, { input: '[1,2,3]', expected: '9' });
    expect(trace.result.verdict).toBe('pass');
    const inHelper = trace.steps.find((s) => s.func === 'bump')!;
    expect(inHelper.frameId).not.toBe(trace.steps[0]!.frameId);
    expect(inHelper.caller?.func).toBe('total');
    const arr = inHelper.locals.find((v) => v.name === 'arr')!;
    const nums = inHelper.caller!.locals.find((v) => v.name === 'nums')!;
    expect(arr.ref).toBeDefined();
    expect(arr.ref).toBe(nums.ref);
    // back in the entry: its own frame again, and no caller
    const after = trace.steps.filter((s) => s.func === 'total').at(-1)!;
    expect(after.frameId).toBe(trace.steps[0]!.frameId);
    expect(after.caller).toBeUndefined();
  }, 30_000);

  it('runs whichever candidate an edited call site calls', () => {
    const code = `int square(int x) { return x * x; }
class Solution {
public:
    int twice(int x) { return 2 * x; }
};`;
    const trace = traceCase('cpp', code, { input: '4', expected: '16' }, 'auto result = square(a0);');
    expect(trace.entry).toEqual({ name: 'square', className: null });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.systemCode).toBe('auto result = square(a0);');
  }, 30_000);

  it('resolves overloads by the testcase argument count', () => {
    const code = `class Solution {
public:
    int solve(int a) { return a; }
    int solve(int a, int b) { return a + b; }
};`;
    const callSite = 'auto result = Solution().solve(a0, a1);';
    const two = traceCase('cpp', code, { input: '2\n3', expected: '5' }, callSite);
    expect(two.result.verdict).toBe('pass');
    expect(two.steps.length).toBeGreaterThan(0);
  }, 30_000);

  it('reports call-site and testcase problems as error verdicts that echo the call site', () => {
    const code = 'class Solution { public: int f(int x) { return x; } };';
    const none = traceCase('cpp', code, { input: '1', expected: '1' }, 'auto result = g(a0);');
    expect(none.result.verdict).toBe('error');
    expect(none.result.message).toMatch(/doesn't call any function from your code/);
    expect(none.systemCode).toBe('auto result = g(a0);');

    const arity = traceCase('cpp', code, { input: '1\n2', expected: '1' });
    expect(arity.result.message).toMatch(/f takes 1 argument, but the testcase gives 2/);

    const bad = traceCase('cpp', code, { input: '[1,', expected: '1' });
    expect(bad.result.message).toMatch(/Could not parse the testcase value/);
  });

  it('accepts Python-literal testcases, like the Python runner', () => {
    const code = `class Solution {
public:
    int count(vector<string>& words, bool flag) { return flag ? (int)words.size() : 0; }
};`;
    const trace = traceCase('cpp', code, { input: "['a','b']\nTrue", expected: '2' });
    expect(trace.result.verdict).toBe('pass');
  }, 30_000);
});
