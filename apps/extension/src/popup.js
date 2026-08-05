'use strict';

/*
 * VisionDS — LeetCode Import popup.
 *
 * Capture flow (unchanged): read the Monaco editor + statement testcases in the
 * page's MAIN world, show them editable, and hand off to the site.
 *
 * Handoff now has two paths:
 *   - Signed in  → push the capture to the user's Supabase account; the web app
 *                  pulls it automatically. Opens the site with no payload in the URL.
 *   - Signed out → the original base64url URL-fragment handoff (never leaves the
 *                  browser). This is the fallback whenever accounts aren't in use.
 */

import { pushCapture } from '@visionds/auth';
import { getUser, signInWithGoogle, signOutUser } from './auth';
import { authConfigured, getClient } from './supabase';

const DEFAULT_SITE = 'http://localhost:5173';

const state = {
  language: 'python',
  code: '',
  cases: [{ input: '', expected: '' }],
  problem: {},
  user: null,
};

// ---------------------------------------------------------------------------
// Extraction — serialized into the LeetCode page's MAIN world. Fully
// self-contained (no references to popup-scope variables or bundler helpers).
// ---------------------------------------------------------------------------
function extractFromLeetCode() {
  const langMap = {
    python: 'python',
    python3: 'python',
    py: 'python',
    cpp: 'cpp',
    'c++': 'cpp',
    java: 'java',
  };
  const out = { code: '', language: 'python', problem: {}, cases: [] };

  try {
    const raw = (localStorage.getItem('global_lang') || '').replace(/"/g, '').toLowerCase();
    if (langMap[raw]) out.language = langMap[raw];
  } catch (_) {}

  try {
    const monaco = window.monaco;
    if (monaco && monaco.editor && typeof monaco.editor.getModels === 'function') {
      const models = monaco.editor.getModels();
      let best = null;
      let bestLen = -1;
      for (const m of models) {
        const v = m.getValue();
        if (v.length > bestLen) {
          best = m;
          bestLen = v.length;
        }
      }
      if (best) {
        out.code = best.getValue();
        const mlang = best.getLanguageId ? best.getLanguageId().toLowerCase() : '';
        if (langMap[mlang]) out.language = langMap[mlang];
      }
    }
  } catch (_) {}

  try {
    const m = location.pathname.match(/problems\/([^/]+)/);
    if (m) out.problem.slug = m[1];
    out.problem.url = location.href.split('#')[0];
    const el = document.querySelector(
      'a[href^="/problems/"] .text-title-large, .text-title-large a, [data-cy="question-title"]',
    );
    let title = el ? el.textContent.trim() : '';
    if (!title) title = (document.title || '').replace(/\s*-\s*LeetCode.*$/i, '').trim();
    out.problem.title = title;
  } catch (_) {}

  function splitTopLevel(s) {
    const parts = [];
    let depth = 0;
    let cur = '';
    let quote = null;
    for (const ch of s) {
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) parts.push(cur);
    return parts;
  }
  function toInputLines(raw) {
    return splitTopLevel(raw)
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
  }
  try {
    const text = document.body.innerText || '';
    const re =
      /Input:\s*([\s\S]*?)\s*Output:\s*([\s\S]*?)(?=\n\s*(?:Explanation:|Example|Constraints)|\n\n|$)/g;
    let mm;
    while ((mm = re.exec(text)) && out.cases.length < 10) {
      const input = toInputLines(mm[1].trim());
      const expected = mm[2].trim().split('\n')[0].trim();
      if (input) out.cases.push({ input, expected });
    }
  } catch (_) {}

  if (!out.cases.length) out.cases.push({ input: '', expected: '' });
  return out;
}

// ---------------------------------------------------------------------------
// Handoff encoding — UTF-8-safe base64url (mirror of readImportFromHash).
// ---------------------------------------------------------------------------
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function setStatus(msg, isError) {
  const el = $('status');
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}

function renderAuth() {
  const row = $('auth-row');
  if (!row) return;
  if (!authConfigured) {
    row.hidden = true;
    return;
  }
  row.hidden = false;
  const label = $('auth-label');
  const btn = $('auth-btn');
  if (state.user) {
    label.textContent = state.user.email || 'Signed in';
    btn.textContent = 'Sign out';
    btn.dataset.action = 'signout';
  } else {
    label.textContent = 'Not signed in';
    btn.textContent = 'Sign in with Google';
    btn.dataset.action = 'signin';
  }
}

function renderCases() {
  const wrap = $('cases');
  wrap.innerHTML = '';
  state.cases.forEach((c, i) => {
    const box = document.createElement('div');
    box.className = 'case';

    const head = document.createElement('div');
    head.className = 'field-label';
    const label = document.createElement('span');
    label.textContent = 'Input ' + (i + 1);
    head.appendChild(label);
    if (state.cases.length > 1) {
      const rm = document.createElement('button');
      rm.className = 'icon-btn';
      rm.textContent = '✕';
      rm.title = 'Remove testcase';
      rm.addEventListener('click', () => {
        state.cases.splice(i, 1);
        renderCases();
      });
      head.appendChild(rm);
    }
    box.appendChild(head);

    const input = document.createElement('textarea');
    input.value = c.input;
    input.placeholder = '[2,7,11,15]\n9';
    input.addEventListener('input', () => {
      state.cases[i].input = input.value;
    });
    box.appendChild(input);

    const expLabel = document.createElement('div');
    expLabel.className = 'field-label case-expected';
    expLabel.textContent = 'Expected output';
    box.appendChild(expLabel);

    const exp = document.createElement('input');
    exp.value = c.expected;
    exp.placeholder = '[0,1]';
    exp.addEventListener('input', () => {
      state.cases[i].expected = exp.value;
    });
    box.appendChild(exp);

    wrap.appendChild(box);
  });
}

function renderProblem() {
  const el = $('problem-title');
  const title = state.problem && state.problem.title;
  el.textContent = title || 'LeetCode problem';
  el.classList.remove('empty');
}

// ---------------------------------------------------------------------------
// Capture on open
// ---------------------------------------------------------------------------
async function capture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    setStatus('No active tab.', true);
    return;
  }
  const isLeetCode = /^https:\/\/([a-z0-9-]+\.)?leetcode\.com\/problems\//.test(tab.url || '');
  if (!isLeetCode) {
    $('problem-title').textContent = 'Open a LeetCode problem to import';
    setStatus('This isn’t a LeetCode problem page — you can still fill in the fields manually.');
    $('open-btn').disabled = false;
    renderCases();
    return;
  }

  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: extractFromLeetCode,
    });
    const data = res && res.result;
    if (data) {
      state.language = data.language || 'python';
      state.code = data.code || '';
      state.cases = data.cases && data.cases.length ? data.cases : [{ input: '', expected: '' }];
      state.problem = data.problem || {};
    }
    $('language').value = state.language;
    $('code').value = state.code;
    if (!state.code) $('code-details').open = true;
    renderProblem();
    renderCases();
    $('open-btn').disabled = false;
    setStatus(
      state.code
        ? 'Captured. Review below, then open in VisionDS.'
        : 'Couldn’t read the editor — paste your code below.',
      !state.code,
    );
  } catch (e) {
    setStatus('Capture failed: ' + (e && e.message ? e.message : e), true);
    $('open-btn').disabled = false;
    renderCases();
  }
}

// ---------------------------------------------------------------------------
// Open handoff
// ---------------------------------------------------------------------------
function currentPayload() {
  const cases = state.cases.filter((c) => c.input.trim() || c.expected.trim());
  return {
    language: state.language,
    code: state.code,
    cases: cases.length ? cases : [{ input: '', expected: '' }],
    problem: state.problem,
  };
}

async function siteBase() {
  const stored = await chrome.storage.sync.get('siteUrl');
  const base = ($('site-url').value.trim() || stored.siteUrl || DEFAULT_SITE).replace(/\/+$/, '');
  await chrome.storage.sync.set({ siteUrl: base });
  return base;
}

async function openInVisionDS() {
  const payload = currentPayload();
  const base = await siteBase();

  // Signed in: sync the capture to the account; the web app pulls it on load.
  if (state.user) {
    try {
      const client = getClient();
      await pushCapture(client, {
        language: payload.language,
        code: payload.code,
        testcases: payload.cases,
        problem: payload.problem || null,
      });
      await chrome.tabs.create({ url: base + '/' });
      setStatus('Synced to your account — opening VisionDS.');
      window.close();
      return;
    } catch (e) {
      // Fall through to the URL-hash handoff so the user is never blocked.
      setStatus('Sync failed, using direct handoff: ' + (e && e.message ? e.message : e), true);
    }
  }

  const url = `${base}/#import=${b64urlEncode(JSON.stringify({ v: 1, ...payload }))}`;
  try {
    await chrome.tabs.create({ url });
    setStatus('Opened in VisionDS.');
    window.close();
  } catch (e) {
    setStatus('Could not open the tab: ' + (e && e.message ? e.message : e), true);
  }
}

// ---------------------------------------------------------------------------
// Auth actions
// ---------------------------------------------------------------------------
async function onAuthClick() {
  const btn = $('auth-btn');
  const action = btn.dataset.action;
  btn.disabled = true;
  try {
    if (action === 'signin') {
      state.user = await signInWithGoogle();
      setStatus('Signed in.');
    } else {
      await signOutUser();
      state.user = null;
      setStatus('Signed out.');
    }
  } catch (e) {
    setStatus((e && e.message ? e.message : String(e)), true);
  } finally {
    btn.disabled = false;
    renderAuth();
  }
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.sync.get('siteUrl');
  $('site-url').value = stored.siteUrl || DEFAULT_SITE;

  $('language').addEventListener('change', (e) => {
    state.language = e.target.value;
  });
  $('code').addEventListener('input', (e) => {
    state.code = e.target.value;
  });
  $('add-case').addEventListener('click', () => {
    state.cases.push({ input: '', expected: '' });
    renderCases();
  });
  $('open-btn').addEventListener('click', openInVisionDS);
  const authBtn = $('auth-btn');
  if (authBtn) authBtn.addEventListener('click', onAuthClick);

  renderCases();

  if (authConfigured) {
    try {
      state.user = await getUser();
    } catch (_) {}
  }
  renderAuth();

  await capture();
});
