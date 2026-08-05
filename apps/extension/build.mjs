// Bundles the popup so it can import the shared @visionds/auth package.
// Output is a self-contained apps/extension/dist/ folder you load unpacked.
//
// Supabase config is injected at build time from the environment (both values
// are public-safe — RLS guards the data):
//   VISIONDS_SUPABASE_URL, VISIONDS_SUPABASE_ANON_KEY
// Leave them unset to build an auth-free extension that still does the URL-hash
// handoff exactly as before.

import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outdir = join(root, 'dist');
const watch = process.argv.includes('--watch');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

// Static assets copied verbatim next to the bundle.
for (const f of ['manifest.json', 'popup.html']) {
  await cp(join(root, f), join(outdir, f));
}

const define = {
  __SUPABASE_URL__: JSON.stringify(process.env.VISIONDS_SUPABASE_URL ?? ''),
  __SUPABASE_ANON_KEY__: JSON.stringify(process.env.VISIONDS_SUPABASE_ANON_KEY ?? ''),
};

const options = {
  entryPoints: [join(root, 'src', 'popup.js')],
  bundle: true,
  format: 'esm',
  target: 'chrome110',
  outfile: join(outdir, 'popup.js'),
  define,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[visionds] extension watching… (dist/ is load-unpacked)');
} else {
  await esbuild.build(options);
  console.log(`[visionds] extension built → ${outdir}`);
  if (!process.env.VISIONDS_SUPABASE_URL) {
    console.log('[visionds] (no Supabase env set — built without accounts; URL-hash handoff still works)');
  }
}
