import type { SyntaxNode } from '@lezer/common';
import { parser } from '@lezer/cpp';
import { type CallSiteCall, children, descendants, lineIndex, makePolicy, type Unit } from './policy';
import { type Candidate, type Param, SubmissionError } from './types';

/**
 * C++: candidates are top-level functions (never `main`) and the *public*
 * methods of `class`/`struct Solution`, whether defined in the class or out
 * of line as `Solution::f`. Constructors, operators, private and protected
 * methods, and members of any other struct (a student's own `ListNode`) are
 * not candidates — the last two are what made initializer lists such as
 * `val(x), next(nullptr)` show up as bogus entry points.
 */
export const cppPolicy = makePolicy({
  language: 'cpp',

  extract(code) {
    const top = parser.parse(code).topNode;
    const lineOf = lineIndex(code);
    const candidates: Candidate[] = [];
    const units: Unit[] = [];
    /** Access of methods declared in Solution but defined out of line. */
    const declaredPublic = new Map<string, boolean>();
    let solutions = 0;

    const add = (def: SyntaxNode, className: string | null, isPublic: boolean) => {
      const decl = functionDeclarator(def);
      const nameNode = decl?.firstChild;
      if (!decl || !nameNode) return;
      const name = baseName(code, nameNode);
      if (!name) return;
      units.push({ name, calls: callsIn(code, def) });
      if (!isPublic || name === 'main' || name === 'Solution') return;
      const ps = parameters(code, decl.getChild('ParameterList'));
      candidates.push({
        name,
        className,
        params: ps.params,
        minArgs: ps.minArgs,
        maxArgs: ps.params.length,
        returnType: returnType(code, def, decl),
        line: lineOf(nameNode.from),
      });
    };

    for (const node of children(top)) {
      if (node.name === 'FunctionDefinition') {
        const nameNode = functionDeclarator(node)?.firstChild;
        if (nameNode?.name === 'ScopedIdentifier') {
          // `int Solution::f(...) { ... }` — a Solution method defined out of line.
          const scope = nameNode.getChild('NamespaceIdentifier');
          if (scope && code.slice(scope.from, scope.to) === 'Solution') {
            const name = baseName(code, nameNode) ?? '';
            add(node, 'Solution', declaredPublic.get(name) ?? true);
          }
          continue;
        }
        add(node, null, true);
      } else if (node.name === 'ClassSpecifier' || node.name === 'StructSpecifier') {
        const nameNode = node.getChild('TypeIdentifier');
        if (!nameNode || code.slice(nameNode.from, nameNode.to) !== 'Solution') continue;
        if (++solutions > 1) {
          throw new SubmissionError(
            'There are two `Solution` classes. Keep one per file, or rename the other.',
          );
        }
        let isPublic = node.name === 'StructSpecifier';
        const body = node.getChild('FieldDeclarationList');
        for (const member of body ? children(body) : []) {
          if (member.name === 'AccessSpecifier') {
            isPublic = /^public\b/.test(code.slice(member.from, member.to));
          } else if (member.name === 'FunctionDefinition') {
            add(member, 'Solution', isPublic);
          } else if (member.name === 'FieldDeclaration') {
            const id = member.getChild('FunctionDeclarator')?.firstChild;
            if (id) declaredPublic.set(code.slice(id.from, id.to), isPublic);
          }
        }
      }
    }
    return { candidates, units };
  },

  callSiteCalls(callSite) {
    // Wrapped in a function so bare statements parse as statements.
    const src = `void __vds_call_site() {\n${callSite}\n}`;
    const out: CallSiteCall[] = [];
    for (const call of descendants(parser.parse(src).topNode, 'CallExpression')) {
      const callee = calleeOf(src, call);
      if (callee) out.push(callee);
    }
    return out;
  },

  reaches(call, c) {
    // A static method may be called as `Solution::f(...)`, which reads as a
    // bare call here; only a free function can't be reached through `.`.
    return call.name === c.name && (c.className !== null || !call.member);
  },

  renderCallSite(entry) {
    const args = entry.params.map((_, i) => `a${i}`).join(', ');
    const call = entry.className
      ? `${entry.className}().${entry.name}(${args})`
      : `${entry.name}(${args})`;
    if (entry.returnType !== 'void') return `auto result = ${call};`;
    // In-place solutions return nothing; the answer is the argument they mutate.
    return `${call};\nauto& result = a${inPlaceTarget(entry.params)};`;
  },
});

/** The argument an in-place solution mutates: its first non-const reference. */
export function inPlaceTarget(params: Param[]): number {
  const i = params.findIndex((p) => p.mutableRef);
  return i >= 0 ? i : 0;
}

/** The FunctionDeclarator, unwrapping `int* f()` / `vector<int>& f()`. */
function functionDeclarator(def: SyntaxNode): SyntaxNode | null {
  for (let n: SyntaxNode | null = def.firstChild; n; n = n.nextSibling) {
    if (n.name === 'FunctionDeclarator') return n;
    if (n.name === 'PointerDeclarator' || n.name === 'ReferenceDeclarator') {
      const inner = descendants(n, 'FunctionDeclarator')[0];
      if (inner) return inner;
    }
  }
  return null;
}

/** `f` from `f`, `Solution::f` or `ns::f`; null for operators and destructors. */
function baseName(code: string, node: SyntaxNode): string | null {
  if (node.name === 'Identifier' || node.name === 'FieldIdentifier') {
    return code.slice(node.from, node.to);
  }
  if (node.name === 'ScopedIdentifier') {
    const last = node.lastChild;
    return last && last.name === 'Identifier' ? code.slice(last.from, last.to) : null;
  }
  return null;
}

function calleeOf(code: string, call: SyntaxNode): CallSiteCall | null {
  const callee = call.firstChild;
  if (!callee) return null;
  if (callee.name === 'FieldExpression') {
    const field = callee.getChild('FieldIdentifier');
    return field ? { name: code.slice(field.from, field.to), member: true } : null;
  }
  if (callee.name === 'TemplateFunction') {
    const id = callee.firstChild;
    const name = id ? baseName(code, id) : null;
    return name ? { name, member: false } : null;
  }
  const name = baseName(code, callee);
  return name ? { name, member: false } : null;
}

function callsIn(code: string, def: SyntaxNode): Set<string> {
  const names = new Set<string>();
  const body = def.getChild('CompoundStatement');
  for (const call of body ? descendants(body, 'CallExpression') : []) {
    const callee = calleeOf(code, call);
    if (callee) names.add(callee.name);
  }
  return names;
}

const QUALIFIERS = /\b(?:static|virtual|inline|constexpr|explicit|friend|extern)\b/g;

function returnType(code: string, def: SyntaxNode, decl: SyntaxNode): string {
  // Everything before the declarator, minus storage qualifiers; a declarator
  // wrapped in `*`/`&` (`ListNode* f()`) contributes that to the type.
  const head = code.slice(def.from, decl.from).replace(QUALIFIERS, ' ');
  return head.replace(/\s+/g, ' ').trim().replace(/\s*([*&])\s*$/, '$1');
}

function parameters(code: string, list: SyntaxNode | null): { params: Param[]; minArgs: number } {
  const params: Param[] = [];
  let minArgs = 0;
  for (const p of list ? children(list) : []) {
    const defaulted = p.name === 'OptionalParameterDeclaration';
    if (p.name !== 'ParameterDeclaration' && !defaulted) continue;
    const raw = code.slice(p.from, p.to);
    if (raw.trim() === 'void') continue;
    const nameNode = descendants(p, 'Identifier')[0];
    const name = nameNode ? code.slice(nameNode.from, nameNode.to) : `p${params.length}`;
    const typePart = nameNode
      ? code.slice(p.from, nameNode.from) + code.slice(nameNode.to, p.to).replace(/=.*$/s, '')
      : raw;
    params.push({
      name,
      type: typePart
        .replace(/\bconst\b/g, '')
        .replace(/[&*]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      mutableRef: /&/.test(typePart) && !/\bconst\b/.test(typePart),
    });
    if (!defaulted) minArgs = params.length;
  }
  return { params, minArgs };
}
