import type { SyntaxNode } from '@lezer/common';
import { parser } from '@lezer/python';
import { type CallSiteCall, children, descendants, lineIndex, makePolicy, type Unit } from './policy';
import { type Candidate, type Param, SubmissionError } from './types';

/**
 * Python: candidates are top-level `def`s and the methods directly in
 * `class Solution`'s body. Nested defs (closures), `_`-prefixed and `async`
 * functions are helpers, never candidates — they can't be the target of the
 * synchronous call site the harness runs.
 */
export const pythonPolicy = makePolicy({
  language: 'python',

  extract(code) {
    const top = parser.parse(code).topNode;
    const lineOf = lineIndex(code);
    const candidates: Candidate[] = [];
    const units: Unit[] = [];
    let solutions = 0;

    const add = (def: SyntaxNode, className: string | null, decorators: string[]) => {
      const nameNode = def.getChild('VariableName');
      if (!nameNode) return;
      const name = code.slice(nameNode.from, nameNode.to);
      units.push({ name, calls: callsIn(code, def) });
      const isAsync = def.getChild('async') !== null;
      if (isAsync || name.startsWith('_')) return;
      const bound = className !== null && !decorators.includes('staticmethod');
      candidates.push({
        name,
        className,
        line: lineOf(nameNode.from),
        returnType: null,
        ...params(code, def.getChild('ParamList'), bound),
      });
    };

    for (const node of children(top)) {
      const [def, decorators] = unwrapDecorated(code, node);
      if (def?.name === 'FunctionDefinition') add(def, null, decorators);
      else if (def?.name === 'ClassDefinition') {
        const nameNode = def.getChild('VariableName');
        if (!nameNode || code.slice(nameNode.from, nameNode.to) !== 'Solution') continue;
        if (++solutions > 1) throw duplicateSolution();
        const body = def.getChild('Body');
        for (const member of body ? children(body) : []) {
          const [method, decos] = unwrapDecorated(code, member);
          if (method?.name === 'FunctionDefinition') add(method, 'Solution', decos);
        }
      }
    }
    return { candidates, units };
  },

  callSiteCalls(callSite) {
    const top = parser.parse(callSite).topNode;
    const out: CallSiteCall[] = [];
    for (const call of descendants(top, 'CallExpression')) {
      const callee = calleeOf(callSite, call);
      if (callee) out.push(callee);
    }
    return out;
  },

  reaches(call, c) {
    return call.name === c.name && call.member === (c.className !== null);
  },

  renderCallSite(entry) {
    const target = entry.className ? `${entry.className}().${entry.name}` : entry.name;
    return `result = ${target}(*__vds_args__)`;
  },
});

function duplicateSolution(): SubmissionError {
  return new SubmissionError(
    'There are two `class Solution` definitions, and the second replaces the first when ' +
      'Python runs the file. Keep one per file, or rename the other class.',
  );
}

/** A `@decorated` definition's inner node plus its decorator names. */
function unwrapDecorated(code: string, node: SyntaxNode): [SyntaxNode | null, string[]] {
  if (node.name !== 'DecoratedStatement') return [node, []];
  const decorators = node
    .getChildren('Decorator')
    .map((d) => d.getChild('VariableName'))
    .filter((n): n is SyntaxNode => n !== null)
    .map((n) => code.slice(n.from, n.to));
  const inner = node.getChild('FunctionDefinition') ?? node.getChild('ClassDefinition');
  return [inner, decorators];
}

/** The called name of a CallExpression: `f(...)` or `x.f(...)`. */
function calleeOf(code: string, call: SyntaxNode): CallSiteCall | null {
  const callee = call.firstChild;
  if (callee?.name === 'VariableName') {
    return { name: code.slice(callee.from, callee.to), member: false };
  }
  if (callee?.name === 'MemberExpression') {
    const prop = callee.getChild('PropertyName');
    if (prop) return { name: code.slice(prop.from, prop.to), member: true };
  }
  return null;
}

/** Every name the body calls, nested defs included. */
function callsIn(code: string, def: SyntaxNode): Set<string> {
  const names = new Set<string>();
  const body = def.getChild('Body');
  for (const call of body ? descendants(body, 'CallExpression') : []) {
    const callee = calleeOf(code, call);
    if (callee) names.add(callee.name);
  }
  return names;
}

/**
 * Positional parameters and how many arguments a call may pass. `self`/`cls`
 * is dropped for bound methods; parameters after `*` or `*args` are
 * keyword-only and never filled by `*__vds_args__`.
 */
function params(
  code: string,
  list: SyntaxNode | null,
  bound: boolean,
): Pick<Candidate, 'params' | 'minArgs' | 'maxArgs'> {
  const positional: Param[] = [];
  let firstDefault = -1;
  let varargs = false;
  let keywordOnly = false;
  let inDefault = false;
  let star: string | null = null;

  for (const n of list ? children(list) : []) {
    if (n.name === ',' || n.name === ')') {
      if (star === '*') keywordOnly = true; // a bare `*,` marker
      star = null;
      inDefault = false;
      continue;
    }
    if (inDefault) continue;
    if (n.name === '*' || n.name === '**') {
      star = n.name;
      continue;
    }
    if (n.name === 'AssignOp') {
      if (firstDefault === -1 && !keywordOnly) firstDefault = positional.length - 1;
      inDefault = true;
      continue;
    }
    if (n.name !== 'VariableName') continue;
    if (star === '*') varargs = true;
    if (star) {
      keywordOnly = true;
      star = null;
      continue;
    }
    if (!keywordOnly) positional.push({ name: code.slice(n.from, n.to), type: null });
  }

  const required = firstDefault === -1 ? positional.length : firstDefault;
  const drop = bound && positional.length > 0 ? 1 : 0;
  const ps = positional.slice(drop);
  return {
    params: ps,
    minArgs: Math.max(0, required - drop),
    maxArgs: varargs ? null : ps.length,
  };
}
