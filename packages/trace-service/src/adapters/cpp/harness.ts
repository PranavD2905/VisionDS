import type { JsonValue, TestCase } from '@visionds/trace-schema';
import { parseArgs } from '../../parseInput';
import { extractSignature, findCppEntry } from './entry';
import { cppLiteralForType, inferCppArg } from './infer';

export const RESULT_SENTINEL = '__VISIONDS_RESULT__';

export interface GeneratedProgram {
  source: string;
  entry: string;
  /** 1-based line range of the student's own code within `source`. */
  studentStart: number;
  studentEnd: number;
}

const INCLUDES = [
  // Explicit headers (Apple clang's libc++ has no <bits/stdc++.h>); covers the
  // containers and utilities LeetCode solutions reach for.
  '#include <algorithm>',
  '#include <array>',
  '#include <bitset>',
  '#include <climits>',
  '#include <cmath>',
  '#include <cstdint>',
  '#include <cstring>',
  '#include <deque>',
  '#include <functional>',
  '#include <iostream>',
  '#include <limits>',
  '#include <list>',
  '#include <map>',
  '#include <numeric>',
  '#include <optional>',
  '#include <queue>',
  '#include <set>',
  '#include <sstream>',
  '#include <stack>',
  '#include <string>',
  '#include <unordered_map>',
  '#include <unordered_set>',
  '#include <utility>',
  '#include <vector>',
  'using namespace std;',
];

// Result serializer (return value -> JSON, printed with a sentinel).
const SERIALIZERS_BASE = [
  'namespace __vds {',
  'inline string j(bool b){ return b ? "true" : "false"; }',
  'inline string j(int x){ return to_string(x); }',
  'inline string j(long x){ return to_string(x); }',
  'inline string j(long long x){ return to_string(x); }',
  'inline string j(unsigned x){ return to_string(x); }',
  'inline string j(unsigned long x){ return to_string(x); }',
  'inline string j(unsigned long long x){ return to_string(x); }',
  'inline string j(double x){ ostringstream o; o<<x; return o.str(); }',
  'inline string j(const string& s){ string o="\\""; for(char c: s){ if(c==\'"\'||c==\'\\\\\') o+=\'\\\\\'; o+=c; } o+="\\""; return o; }',
  'inline string j(const char* s){ return j(string(s)); }',
  'inline string j(char c){ return j(string(1,c)); }',
  'template<class T> string j(const vector<T>& v){ string o="["; for(size_t i=0;i<v.size();i++){ if(i) o+=","; o+=j(v[i]); } o+="]"; return o; }',
  '}',
];

// Standard LeetCode node definitions, only emitted when the student doesn't
// provide their own (LeetCode pre-defines these; students rarely redeclare).
const LIST_STRUCT =
  'struct ListNode { int val; ListNode *next; ListNode(): val(0), next(nullptr) {} ListNode(int x): val(x), next(nullptr) {} ListNode(int x, ListNode* n): val(x), next(n) {} };';
const TREE_STRUCT =
  'struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(): val(0), left(nullptr), right(nullptr) {} TreeNode(int x): val(x), left(nullptr), right(nullptr) {} TreeNode(int x, TreeNode* l, TreeNode* r): val(x), left(l), right(r) {} };';

// Builders (JSON array -> linked structure) + serializers (structure -> JSON),
// emitted after the student code so a student's own node definitions are visible.
const LIST_HELPERS = [
  'ListNode* __build_list(const vector<int>& xs){ ListNode* h=nullptr,*t=nullptr; for(int x: xs){ ListNode* n=new ListNode(x); if(!h)h=t=n; else {t->next=n;t=n;} } return h; }',
  'namespace __vds { inline string j(ListNode* head){ string o="["; ListNode* c=head; set<ListNode*> seen; bool f=true; while(c){ if(seen.count(c)) break; seen.insert(c); if(!f)o+=","; f=false; o+=to_string(c->val); c=c->next; } o+="]"; return o; } }',
];
const TREE_HELPERS = [
  'TreeNode* __build_tree(const vector<optional<int>>& xs){ if(xs.empty()||!xs[0].has_value()) return nullptr; TreeNode* root=new TreeNode(*xs[0]); queue<TreeNode*> q; q.push(root); size_t i=1; while(!q.empty()&&i<xs.size()){ TreeNode* n=q.front(); q.pop(); if(i<xs.size()){ if(xs[i].has_value()){ n->left=new TreeNode(*xs[i]); q.push(n->left);} i++;} if(i<xs.size()){ if(xs[i].has_value()){ n->right=new TreeNode(*xs[i]); q.push(n->right);} i++;} } return root; }',
  'namespace __vds { inline string j(TreeNode* root){ if(!root) return "[]"; vector<string> out; queue<TreeNode*> q; q.push(root); while(!q.empty()){ TreeNode* n=q.front(); q.pop(); if(n){ out.push_back(to_string(n->val)); q.push(n->left); q.push(n->right);} else out.push_back("null"); } while(!out.empty()&&out.back()=="null") out.pop_back(); string o="["; for(size_t i=0;i<out.size();i++){ if(i)o+=","; o+=out[i]; } o+="]"; return o; } }',
];

/**
 * Build a single compilable translation unit: prelude (includes, serializers,
 * and conditionally the ListNode/TreeNode structs), the student's code verbatim
 * on known line numbers, then node builders/serializers and a generated `main`
 * that constructs the testcase arguments, calls the entry point, and prints the
 * result as JSON via a sentinel.
 */
export function generateCppProgram(code: string, testCase: TestCase): GeneratedProgram {
  const entry = findCppEntry(code);
  const sig = extractSignature(code, entry);
  const args: JsonValue[] = parseArgs(testCase.input);

  const usesList = /\bListNode\b/.test(code);
  const usesTree = /\bTreeNode\b/.test(code);
  const definesList = /\b(?:struct|class)\s+ListNode\b/.test(code);
  const definesTree = /\b(?:struct|class)\s+TreeNode\b/.test(code);

  // Use the student's declared parameter types when the signature parsed and
  // matches the argument count; otherwise infer each type from its JSON value.
  const useSig = sig !== null && sig.params.length === args.length;
  const decls = args.map((v, i) => {
    const declared = useSig ? sig!.params[i]!.valueType : '';
    if (declared === 'ListNode') return `  ListNode* a${i} = __build_list(${intVecLiteral(v)});`;
    if (declared === 'TreeNode') return `  TreeNode* a${i} = __build_tree(${optVecLiteral(v)});`;
    if (declared) return `  ${declared} a${i} = ${cppLiteralForType(declared, v)};`;
    const a = inferCppArg(v);
    return `  ${a.type} a${i} = ${a.literal};`;
  });

  const argList = args.map((_, i) => `a${i}`).join(', ');
  const call = entry.className
    ? `${entry.className}().${entry.name}(${argList})`
    : `${entry.name}(${argList})`;

  // In-place (void) solutions: run the call, then serialize the mutated
  // argument (the first non-const reference) as the answer to compare.
  const isVoid = useSig && sig!.returnType === 'void';
  const callAndResult = isVoid
    ? [`  ${call};`, `  string __out = __vds::j(a${voidTargetIndex(sig!)});`]
    : [`  auto __r = ${call};`, '  string __out = __vds::j(__r);'];

  const prelude = [...INCLUDES, '', ...SERIALIZERS_BASE];
  if (usesList && !definesList) prelude.push(LIST_STRUCT);
  if (usesTree && !definesTree) prelude.push(TREE_STRUCT);

  const nodeHelpers = [...(usesList ? LIST_HELPERS : []), ...(usesTree ? TREE_HELPERS : [])];

  const main = [
    'int main(){',
    ...decls,
    ...callAndResult,
    `  cout << "${RESULT_SENTINEL}" << __out << "\\n";`,
    '  return 0;',
    '}',
  ];

  const lines: string[] = [...prelude, '// ---- student code ----'];
  const studentStart = lines.length + 1;
  const studentLines = code.replace(/\n+$/, '').split('\n');
  lines.push(...studentLines);
  const studentEnd = lines.length;
  lines.push('// ---- harness ----', ...nodeHelpers, ...main);

  return {
    source: lines.join('\n') + '\n',
    entry: entry.name,
    studentStart,
    studentEnd,
  };
}

/** `{1, 2, 3}` from a JSON int array (for __build_list). */
function intVecLiteral(v: JsonValue): string {
  if (!Array.isArray(v)) return '{}';
  return `{${v.map((x) => (typeof x === 'number' ? String(Math.trunc(x)) : '0')).join(', ')}}`;
}

/** `{1, nullopt, 3}` from a JSON level-order array with nulls (for __build_tree). */
function optVecLiteral(v: JsonValue): string {
  if (!Array.isArray(v)) return '{}';
  return `{${v
    .map((x) => (x === null ? 'nullopt' : typeof x === 'number' ? String(Math.trunc(x)) : 'nullopt'))
    .join(', ')}}`;
}

/** The argument a void solution mutates: first non-const reference, else the first. */
function voidTargetIndex(sig: { params: { mutableRef: boolean }[] }): number {
  const idx = sig.params.findIndex((p) => p.mutableRef);
  return idx >= 0 ? idx : 0;
}
