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

const PRELUDE = [
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
  '',
  '// VisionDS result serializer (return value -> JSON, printed with a sentinel)',
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

/**
 * Build a single compilable translation unit: a fixed prelude, the student's
 * code verbatim, then a generated `main` that constructs the testcase arguments
 * as typed C++ locals, calls the entry point, and prints the result as JSON.
 * The student's code sits on known line numbers so the stepper can map the
 * debugger's line events back to the original source.
 */
export function generateCppProgram(code: string, testCase: TestCase): GeneratedProgram {
  const entry = findCppEntry(code);
  const sig = extractSignature(code, entry);
  const args: JsonValue[] = parseArgs(testCase.input);

  // Use the student's declared parameter types when the signature parsed and
  // matches the argument count; otherwise infer each type from its JSON value.
  const useSig = sig !== null && sig.params.length === args.length;
  const decls = args.map((v, i) => {
    const declared = useSig ? sig!.params[i]!.valueType : '';
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

  const main = [
    'int main(){',
    ...decls,
    ...callAndResult,
    `  cout << "${RESULT_SENTINEL}" << __out << "\\n";`,
    '  return 0;',
    '}',
  ];

  const lines: string[] = [...PRELUDE, '// ---- student code ----'];
  const studentStart = lines.length + 1;
  const studentLines = code.replace(/\n+$/, '').split('\n');
  lines.push(...studentLines);
  const studentEnd = lines.length;
  lines.push('// ---- harness ----', ...main);

  return {
    source: lines.join('\n') + '\n',
    entry: entry.name,
    studentStart,
    studentEnd,
  };
}

/** The argument a void solution mutates: first non-const reference, else the first. */
function voidTargetIndex(sig: { params: { mutableRef: boolean }[] }): number {
  const idx = sig.params.findIndex((p) => p.mutableRef);
  return idx >= 0 ? idx : 0;
}
