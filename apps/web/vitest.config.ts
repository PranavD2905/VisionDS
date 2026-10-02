import { defineConfig } from 'vitest/config';

// Unit tests cover pure workbench logic only; they need none of the app's
// Vite plugins (React, the Pyodide asset copy).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
