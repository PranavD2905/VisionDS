import type { SyntaxNode } from '@lezer/common';
import { parser } from '@lezer/java';
import { type CallSiteCall, children, descendants, lineIndex, makePolicy, type Unit } from './policy';
import { type Candidate, type Param, SubmissionError } from './types';

/**
 * Java: candidates are the public methods declared directly in the top-level
 * `class Solution`. Methods of inner classes (a `TrieNode` inside Solution)
 * and constructors are not candidates. Overloads stay separate candidates and
 * are told apart by the testcase's argument count.
 */
export const javaPolicy = makePolicy({
  language: 'java',

  extract(code) {
    const top = parser.parse(code).topNode;
    const lineOf = lineIndex(code);
    const candidates: Candidate[] = [];
    const units: Unit[] = [];
    let solutions = 0;

    for (const node of children(top)) {
      if (node.name !== 'ClassDeclaration') continue;
      const def = node.getChild('Definition');
      if (!def || code.slice(def.from, def.to) !== 'Solution') continue;
      if (++solutions > 1) {
        throw new SubmissionError(
          'There are two `class Solution` definitions. Keep one per file, or rename the other.',
        );
      }
      const body = node.getChild('ClassBody');
      for (const member of body ? children(body) : []) {
        if (member.name !== 'MethodDeclaration') continue;
        const nameNode = member.getChild('Definition');
        if (!nameNode) continue;
        const name = code.slice(nameNode.from, nameNode.to);
        units.push({ name, calls: callsIn(code, member) });
        const mods = member.getChild('Modifiers');
        if (!mods || !mods.getChild('public')) continue;
        const ps = parameters(code, member.getChild('FormalParameters'));
        candidates.push({
          name,
          className: 'Solution',
          params: ps.params,
          minArgs: ps.varargs ? ps.params.length - 1 : ps.params.length,
          maxArgs: ps.varargs ? null : ps.params.length,
          returnType: returnType(code, member, nameNode),
          line: lineOf(nameNode.from),
        });
      }
    }
    return { candidates, units };
  },

  callSiteCalls(callSite) {
    // Wrapped in a method so bare statements parse as statements.
    const src = `class __VdsCallSite { void run() {\n${callSite}\n} }`;
    const out: CallSiteCall[] = [];
    for (const call of descendants(parser.parse(src).topNode, 'MethodInvocation')) {
      const callee = calleeOf(src, call);
      if (callee) out.push(callee);
    }
    return out;
  },

  reaches(call, c) {
    return call.name === c.name;
  },

  renderCallSite(entry) {
    const args = entry.params.map((_, i) => `a${i}`).join(', ');
    const call = `new Solution().${entry.name}(${args})`;
    if (entry.returnType !== 'void') return `var result = ${call};`;
    // In-place solutions return nothing; the answer is the argument they mutate.
    return `${call};\nvar result = a${javaInPlaceTarget(entry.params)};`;
  },
});

/** The argument an in-place solution mutates: its first array or List. */
export function javaInPlaceTarget(params: Param[]): number {
  const i = params.findIndex((p) => /\[\]$|^List</.test(p.type ?? ''));
  return i >= 0 ? i : 0;
}

function calleeOf(code: string, call: SyntaxNode): CallSiteCall | null {
  const name = call.getChild('MethodName');
  if (!name) return null;
  const member = call.firstChild?.name !== 'MethodName';
  return { name: code.slice(name.from, name.to), member };
}

function callsIn(code: string, method: SyntaxNode): Set<string> {
  const names = new Set<string>();
  const body = method.getChild('Block');
  for (const call of body ? descendants(body, 'MethodInvocation') : []) {
    const callee = calleeOf(code, call);
    if (callee) names.add(callee.name);
  }
  return names;
}

/** The type between the modifiers (and any type parameters) and the name. */
function returnType(code: string, method: SyntaxNode, nameNode: SyntaxNode): string {
  let start = method.from;
  for (const n of children(method)) {
    if (n.from >= nameNode.from) break;
    if (n.name === 'Modifiers' || n.name === 'TypeParameters') start = n.to;
  }
  return code.slice(start, nameNode.from).replace(/\s+/g, ' ').trim();
}

function parameters(
  code: string,
  list: SyntaxNode | null,
): { params: Param[]; varargs: boolean } {
  const params: Param[] = [];
  let varargs = false;
  for (const p of list ? children(list) : []) {
    if (p.name !== 'FormalParameter' && p.name !== 'SpreadParameter') continue;
    if (p.name === 'SpreadParameter') varargs = true;
    const nameNode = p.getChild('Definition');
    const name = nameNode ? code.slice(nameNode.from, nameNode.to) : `p${params.length}`;
    const mods = p.getChild('Modifiers');
    const typeStart = mods ? mods.to : p.from;
    // `int nums[]` — C-style dimensions after the name belong to the type.
    const after = nameNode ? code.slice(nameNode.to, p.to).replace(/\s+/g, '') : '';
    const head = code.slice(typeStart, nameNode ? nameNode.from : p.to);
    const type = (head.replace(/\.\.\.\s*$/, '[]') + after).replace(/\s+/g, ' ').trim();
    params.push({ name, type });
  }
  return { params, varargs };
}
