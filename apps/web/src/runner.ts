import { PyodideRunner } from '@visionds/runners';

/** Single shared runner: the Pyodide runtime loads once and is reused. */
export const runner = new PyodideRunner();
