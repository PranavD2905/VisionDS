import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Serve the pinned Pyodide distribution from /pyodide/ so the app is fully
// self-contained (no CDN); the worker loads pyodide.mjs from there.
const require = createRequire(import.meta.url);
const pyodideDir = dirname(require.resolve('pyodide/package.json'));
const PYODIDE_FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      // one flat target per file so no directory structure is preserved
      targets: PYODIDE_FILES.map((f) => ({
        src: join(pyodideDir, f).replace(/\\/g, '/'),
        dest: 'pyodide',
        // v4 preserves the source directory structure unless stripped
        rename: { stripBase: true },
      })),
    }),
  ],
});
