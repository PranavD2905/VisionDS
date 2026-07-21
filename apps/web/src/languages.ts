import type { TestCase } from '@visionds/trace-schema';

export interface LangDef {
  id: string;
  label: string;
  runsIn: 'browser' | 'server';
  /** Disabled languages render in the picker as "soon". */
  enabled: boolean;
  starterCode: string;
  starterCases: TestCase[];
}

const TWO_SUM_CASES: TestCase[] = [
  { input: '[2,7,11,15]\n9', expected: '[0,1]' },
  { input: '[3,2,4]\n6', expected: '[1,2]' },
];

export const LANGUAGES: LangDef[] = [
  {
    id: 'python',
    label: 'Python',
    runsIn: 'browser',
    enabled: true,
    starterCode: `def twoSum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, i]  # bug: should be [i, j]
`,
    starterCases: TWO_SUM_CASES,
  },
  {
    id: 'cpp',
    label: 'C++',
    runsIn: 'server',
    enabled: true,
    starterCode: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            int need = target - nums[i];
            if (seen.count(need))
                return {seen[need], seen[need]};  // bug: should be {seen[need], i}
            seen[nums[i]] = i;
        }
        return {};
    }
};
`,
    starterCases: TWO_SUM_CASES,
  },
  {
    id: 'java',
    label: 'Java',
    runsIn: 'server',
    enabled: true,
    starterCode: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (seen.containsKey(need))
                return new int[]{seen.get(need), seen.get(need)};  // bug: should be {seen.get(need), i}
            seen.put(nums[i], i);
        }
        return new int[]{};
    }
}
`,
    starterCases: TWO_SUM_CASES,
  },
];

export const DEFAULT_LANGUAGE = 'python';

export function langById(id: string): LangDef {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0]!;
}
