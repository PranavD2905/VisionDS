# VisionDS — LeetCode Import (browser extension)

A Manifest V3 Chrome extension that captures the code + testcases you're working
on in LeetCode and hands them off to the VisionDS web app for an animated
dry-run.

It has a **small esbuild step** so the popup can share the `@visionds/auth`
package with the web app (one source of truth for sign-in). Build it, then load
the generated `dist/` folder unpacked.

## Build

```sh
pnpm --filter @visionds/extension build      # → apps/extension/dist/
pnpm --filter @visionds/extension dev        # rebuild on change
```

Optional Supabase config, injected at build time (both public-safe — RLS guards
the data). Leave unset to build an **auth-free** extension that still does the
URL-hash handoff exactly as before:

```sh
VISIONDS_SUPABASE_URL=https://<project>.supabase.co \
VISIONDS_SUPABASE_ANON_KEY=<anon key> \
pnpm --filter @visionds/extension build
```

## Accounts (optional)

When built with Supabase config, the popup shows a **Sign in with Google** row
(OAuth via `chrome.identity.launchWebAuthFlow`; session stored in
`chrome.storage`). Signed in, **Open in VisionDS** syncs the capture to your
account and the web app pulls it on load. Signed out — or if the sync fails —
it falls back to the URL-fragment handoff below, so you're never blocked.

## How it works

1. Open a LeetCode problem (`https://leetcode.com/problems/…`) and click the
   VisionDS toolbar button.
2. The popup runs a small extractor in the page's **MAIN world** (via
   `chrome.scripting.executeScript`) to read:
   - your code, from the Monaco editor model;
   - the selected language, from LeetCode's `global_lang` (mapped to
     `python` / `cpp` / `java`);
   - the problem title/slug from the URL and page;
   - example testcases parsed from the statement's `Input: … Output: …` blocks
     (comma-separated args split into one-per-line, VisionDS's input format).
3. Everything shows up **editable** in the popup, so a LeetCode DOM change never
   blocks you — fix anything, add/remove testcases, then hit **Open in VisionDS**.
4. The payload is encoded as UTF-8-safe base64url into the site URL fragment:
   `http://localhost:5173/#import=<payload>`. The fragment never leaves the
   browser. `/` is the landing page now, so it forwards the fragment untouched
   to `/app`, where `PastePage` decodes it (`apps/web/src/lib/import.ts`),
   prefills the editor + testcases, and shows an "Imported from LeetCode" badge.

## Install (unpacked)

1. `pnpm --filter @visionds/extension build` (see above).
2. `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the generated `apps/extension/dist/` folder.
3. (Optional) In the popup, expand **VisionDS site URL** to point at your
   deployed site instead of the `http://localhost:5173` default. It's saved via
   `chrome.storage.sync`.

## Handoff contract

The payload written to the hash (see `apps/web/src/lib/import.ts` for the
decoder):

```json
{
  "v": 1,
  "language": "python | cpp | java",
  "code": "…student source…",
  "cases": [{ "input": "[2,7,11,15]\n9", "expected": "[0,1]" }],
  "problem": { "title": "Two Sum", "slug": "two-sum", "url": "https://leetcode.com/problems/two-sum/" }
}
```

`input` follows VisionDS's convention: **one argument per line**, LeetCode-style
literals; `name = literal` lines are accepted.

## Notes / limits

- Permissions: `scripting`, `activeTab`, `storage`, `identity` (Google sign-in),
  plus LeetCode and `*.supabase.co` host access. No content script runs
  persistently; extraction happens only when you open the popup.
- For Google OAuth, register the extension's redirect URL
  (`https://<extension-id>.chromiumapp.org/`) in both the Google OAuth client and
  Supabase's allowed redirect URLs.
- LeetCode's editor is Monaco; reading it needs MAIN-world access, which is why
  the extractor is injected rather than run from a content script's isolated
  world.
- Testcase extraction is best-effort against the problem statement. The popup is
  the source of truth — review before importing.
- No toolbar icon PNGs are bundled (Chrome shows a default). Drop
  `icon16/48/128.png` in here and add an `"icons"` block to `manifest.json` to
  brand it.
- Firefox: MV3 support differs (esp. `world: "MAIN"`); this targets Chromium.
