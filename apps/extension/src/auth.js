// Google sign-in for an MV3 popup. There's no redirect page, so we ask Supabase
// for the OAuth URL (skipBrowserRedirect), drive the consent screen through
// chrome.identity.launchWebAuthFlow, and exchange the returned PKCE code for a
// session. The code verifier is persisted by the same client via chrome.storage.

import { getClient } from './supabase';

export async function getUser() {
  const client = getClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

export async function signInWithGoogle() {
  const client = getClient();
  if (!client) throw new Error('Accounts aren’t configured in this build.');

  const redirectTo = chrome.identity.getRedirectURL();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);

  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: data.url,
    interactive: true,
  });
  if (!redirectUrl) throw new Error('Sign-in was cancelled.');

  const url = new URL(redirectUrl);
  const params = new URLSearchParams(url.search || url.hash.replace(/^#/, ''));
  const code = params.get('code');
  if (code) {
    const { error: exErr } = await client.auth.exchangeCodeForSession(code);
    if (exErr) throw new Error(exErr.message);
  } else {
    // Fallback for implicit responses.
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) throw new Error('No session returned.');
    const { error: sErr } = await client.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sErr) throw new Error(sErr.message);
  }
  return getUser();
}

export async function signOutUser() {
  const client = getClient();
  if (client) await client.auth.signOut();
}
