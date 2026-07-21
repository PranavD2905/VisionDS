import type { JsonValue, TestCase } from '@visionds/trace-schema';
import { parseArgs } from '../../parseInput';
import { findJavaEntry } from './entry';

export const RESULT_SENTINEL = '__VISIONDS_RESULT__';

export interface GeneratedJava {
  solution: string;
  main: string;
  entry: string;
  /** 1-based line of the student's first line within Solution.java. */
  studentStart: number;
}

const IMPORTS = 'import java.util.*; import java.util.stream.*;';

const LIST_STRUCT =
  'class ListNode { int val; ListNode next; ListNode() {} ListNode(int v) { val = v; } ListNode(int v, ListNode n) { val = v; next = n; } }';
const TREE_STRUCT =
  'class TreeNode { int val; TreeNode left; TreeNode right; TreeNode() {} TreeNode(int v) { val = v; } TreeNode(int v, TreeNode l, TreeNode r) { val = v; left = l; right = r; } }';

const BUILD_LIST =
  'static ListNode __buildList(int[] xs){ ListNode d=new ListNode(0), t=d; for(int x: xs){ t.next=new ListNode(x); t=t.next; } return d.next; }';
const BUILD_TREE =
  'static TreeNode __buildTree(Integer[] xs){ if(xs.length==0||xs[0]==null) return null; TreeNode root=new TreeNode(xs[0]); java.util.Queue<TreeNode> q=new java.util.LinkedList<>(); q.add(root); int i=1; while(!q.isEmpty()&&i<xs.length){ TreeNode n=q.poll(); if(i<xs.length){ if(xs[i]!=null){ n.left=new TreeNode(xs[i]); q.add(n.left);} i++;} if(i<xs.length){ if(xs[i]!=null){ n.right=new TreeNode(xs[i]); q.add(n.right);} i++;} } return root; }';

/**
 * Build Solution.java (imports + student code, on known lines) and Main.java (a
 * runner that constructs the testcase arguments as typed Java, calls the entry,
 * and prints the result as JSON via a sentinel). ListNode/TreeNode are defined
 * only when the student uses but doesn't declare them.
 */
export function generateJavaProgram(code: string, testCase: TestCase): GeneratedJava {
  const entry = findJavaEntry(code);
  const args = parseArgs(testCase.input);

  const usesList = /\bListNode\b/.test(code);
  const usesTree = /\bTreeNode\b/.test(code);
  const definesList = /\b(?:class|record)\s+ListNode\b/.test(code);
  const definesTree = /\b(?:class|record)\s+TreeNode\b/.test(code);

  const useSig = entry.params.length === args.length;
  const decls = args.map((v, i) => {
    const type = useSig ? entry.params[i]!.type : inferType(v);
    if (type === 'ListNode') return `    ListNode a${i} = __buildList(new int[]${intArray(v)});`;
    if (type === 'TreeNode') return `    TreeNode a${i} = __buildTree(new Integer[]${integerArray(v)});`;
    if (type.endsWith('[]')) return `    ${type} a${i} = ${javaLiteral(type, v)};`;
    return `    ${type} a${i} = ${javaLiteral(type, v)};`;
  });

  const argList = args.map((_, i) => `a${i}`).join(', ');
  const isVoid = entry.returnType === 'void';
  const callAndOut = isVoid
    ? [
        `    new Solution().${entry.name}(${argList});`,
        `    String __out = __json(a${voidTargetIndex(entry.params, args)});`,
      ]
    : [
        `    var __r = new Solution().${entry.name}(${argList});`,
        '    String __out = __json(__r);',
      ];

  const solutionLines = [IMPORTS, ...code.replace(/\n+$/, '').split('\n')];
  const solution = solutionLines.join('\n') + '\n';

  const mainParts: string[] = [IMPORTS, ''];
  if (usesList && !definesList) mainParts.push(LIST_STRUCT);
  if (usesTree && !definesTree) mainParts.push(TREE_STRUCT);
  mainParts.push(
    'public class Main {',
    ...jsonHelper(usesList, usesTree),
    ...(usesList ? [BUILD_LIST] : []),
    ...(usesTree ? [BUILD_TREE] : []),
    '  public static void main(String[] __args) {',
    ...decls,
    ...callAndOut,
    `    System.out.println("${RESULT_SENTINEL}" + __out);`,
    '  }',
    '}',
  );

  return {
    solution,
    main: mainParts.join('\n') + '\n',
    entry: entry.name,
    studentStart: 2, // one prepended IMPORTS line
  };
}

/** The result serializer, with ListNode/TreeNode branches only when those types exist. */
function jsonHelper(usesList: boolean, usesTree: boolean): string[] {
  return [
    '  static String __q(String s){ StringBuilder b=new StringBuilder("\\""); for(int i=0;i<s.length();i++){ char c=s.charAt(i); if(c==\'"\'||c==\'\\\\\') b.append(\'\\\\\'); b.append(c);} return b.append("\\"").toString(); }',
    '  @SuppressWarnings("unchecked")',
    '  static String __json(Object o){',
    '    if(o==null) return "null";',
    '    if(o instanceof Boolean||o instanceof Integer||o instanceof Long||o instanceof Short||o instanceof Byte||o instanceof Double||o instanceof Float) return o.toString();',
    '    if(o instanceof Character||o instanceof String) return __q(o.toString());',
    '    if(o instanceof int[] x){ StringBuilder b=new StringBuilder("["); for(int i=0;i<x.length;i++){ if(i>0)b.append(","); b.append(x[i]); } return b.append("]").toString(); }',
    '    if(o instanceof long[] x){ StringBuilder b=new StringBuilder("["); for(int i=0;i<x.length;i++){ if(i>0)b.append(","); b.append(x[i]); } return b.append("]").toString(); }',
    '    if(o instanceof double[] x){ StringBuilder b=new StringBuilder("["); for(int i=0;i<x.length;i++){ if(i>0)b.append(","); b.append(x[i]); } return b.append("]").toString(); }',
    '    if(o instanceof boolean[] x){ StringBuilder b=new StringBuilder("["); for(int i=0;i<x.length;i++){ if(i>0)b.append(","); b.append(x[i]); } return b.append("]").toString(); }',
    '    if(o instanceof char[] x){ StringBuilder b=new StringBuilder("["); for(int i=0;i<x.length;i++){ if(i>0)b.append(","); b.append(__q(String.valueOf(x[i]))); } return b.append("]").toString(); }',
    '    if(o instanceof Object[] x){ StringBuilder b=new StringBuilder("["); for(int i=0;i<x.length;i++){ if(i>0)b.append(","); b.append(__json(x[i])); } return b.append("]").toString(); }',
    '    if(o instanceof java.util.List<?> l){ StringBuilder b=new StringBuilder("["); for(int i=0;i<l.size();i++){ if(i>0)b.append(","); b.append(__json(l.get(i))); } return b.append("]").toString(); }',
    '    if(o instanceof java.util.Map<?,?> m){ StringBuilder b=new StringBuilder("{"); boolean f=true; for(var e: m.entrySet()){ if(!f)b.append(","); f=false; b.append(__q(String.valueOf(e.getKey()))).append(":").append(__json(e.getValue())); } return b.append("}").toString(); }',
    ...(usesList
      ? ['    if(o instanceof ListNode c){ StringBuilder b=new StringBuilder("["); java.util.Set<ListNode> seen=new java.util.HashSet<>(); boolean f=true; while(c!=null){ if(!seen.add(c)) break; if(!f)b.append(","); f=false; b.append(c.val); c=c.next; } return b.append("]").toString(); }']
      : []),
    ...(usesTree
      ? ['    if(o instanceof TreeNode r){ java.util.List<String> out=new java.util.ArrayList<>(); java.util.Queue<TreeNode> q=new java.util.LinkedList<>(); q.add(r); while(!q.isEmpty()){ TreeNode n=q.poll(); if(n!=null){ out.add(String.valueOf(n.val)); q.add(n.left); q.add(n.right);} else out.add("null"); } while(!out.isEmpty()&&out.get(out.size()-1).equals("null")) out.remove(out.size()-1); return "["+String.join(",",out)+"]"; }']
      : []),
    '    return __q(o.toString());',
    '  }',
  ];
}

function voidTargetIndex(params: { type: string }[], args: JsonValue[]): number {
  const idx = params.findIndex((p) => p.type.endsWith('[]') || /^List</.test(p.type));
  return idx >= 0 ? idx : args.length > 0 ? 0 : 0;
}

// ------------------------------------------------------------ literals

function javaLiteral(type: string, v: JsonValue): string {
  const t = type.replace(/\s+/g, ' ').trim();
  if (t.endsWith('[]')) {
    const elem = t.slice(0, -2).trim();
    const arr = Array.isArray(v) ? v : [];
    return `{${arr.map((x) => javaLiteral(elem, x)).join(', ')}}`;
  }
  const list = t.match(/^List\s*<(.+)>$/);
  if (list) {
    const elem = list[1]!.trim();
    const arr = Array.isArray(v) ? v : [];
    return `new ArrayList<>(Arrays.asList(${arr.map((x) => javaLiteral(elem, x)).join(', ')}))`;
  }
  switch (t) {
    case 'int':
    case 'Integer':
      return String(typeof v === 'number' ? Math.trunc(v) : 0);
    case 'long':
    case 'Long':
      return `${typeof v === 'number' ? Math.trunc(v) : 0}L`;
    case 'double':
    case 'Double':
    case 'float':
    case 'Float':
      return typeof v === 'number' ? (Number.isInteger(v) ? `${v}.0` : String(v)) : '0.0';
    case 'boolean':
    case 'Boolean':
      return v ? 'true' : 'false';
    case 'char':
    case 'Character':
      return javaChar(v);
    case 'String':
      return javaStr(v);
  }
  if (typeof v === 'string') return javaStr(v);
  if (v === null) return 'null';
  return String(v);
}

function intArray(v: JsonValue): string {
  const arr = Array.isArray(v) ? v : [];
  return `{${arr.map((x) => (typeof x === 'number' ? String(Math.trunc(x)) : '0')).join(', ')}}`;
}

function integerArray(v: JsonValue): string {
  const arr = Array.isArray(v) ? v : [];
  return `{${arr.map((x) => (x === null ? 'null' : typeof x === 'number' ? String(Math.trunc(x)) : 'null')).join(', ')}}`;
}

function javaStr(v: JsonValue): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r')}"`;
}

function javaChar(v: JsonValue): string {
  const c = typeof v === 'string' && v.length > 0 ? v[0]! : ' ';
  if (c === "'") return "'\\''";
  if (c === '\\') return "'\\\\'";
  if (c === '\n') return "'\\n'";
  if (c === '\t') return "'\\t'";
  return `'${c}'`;
}

/** Fallback typing from a JSON value when the signature and args disagree. */
function inferType(v: JsonValue): string {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  if (typeof v === 'string') return 'String';
  if (Array.isArray(v)) {
    const first = v.find((x) => x !== null);
    return `${inferType(first ?? 0)}[]`;
  }
  return 'String';
}
