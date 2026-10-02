import { cppPolicy } from './cpp';
import { javaPolicy } from './java';
import { pythonPolicy } from './python';
import type { EntryPolicy } from './types';

export * from './types';
export { label } from './policy';
export { cppPolicy, inPlaceTarget } from './cpp';
export { javaPolicy, javaInPlaceTarget } from './java';
export { pythonPolicy } from './python';

const POLICIES: Record<string, EntryPolicy> = {
  python: pythonPolicy,
  cpp: cppPolicy,
  'c++': cppPolicy,
  java: javaPolicy,
};

/** The entry-point policy for a language id, or undefined if unsupported. */
export function policyFor(language: string): EntryPolicy | undefined {
  return POLICIES[language.toLowerCase()];
}
