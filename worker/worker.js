// Serves games from R2, but only to a signed-in pro account. The session cookie is
// set by the main site (studyingtools.org) with Domain=studyingtools.org, and is
// checked here with the same SESSION_SECRET. Anyone else gets a plain 404.

const COOKIE_NAME = 'sid';

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Same check as readSession() in the main site's lib/session.js.
async function isPro(request, secret) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]+)'));
  if (!match || !secret) return false;

  const [body, sig] = match[1].split('.');
  if (!body || !sig) return false;
  try {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), enc.encode(body)))) return false;
    const data = JSON.parse(dec.decode(b64urlToBytes(body)));
    return data.role === 'pro' && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    if (!(await isPro(request, env.SESSION_SECRET))) return notFound();

    const url = new URL(request.url);
    let key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

    if (key === '' || key.endsWith('/')) {
      key += 'index.html';
    }

    let object = await env.BUCKET.get(key);

    // Directory-style path with no trailing slash and no file extension
    // (e.g. "games/flash" for a request to "games/flash?game=x") -> try index.html
    if (!object && !/\.[a-zA-Z0-9]+$/.test(key)) {
      object = await env.BUCKET.get(key + '/index.html');
    }

    if (!object) return notFound();

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // private: only the pro user's own browser may cache it, never a shared cache.
    headers.set('cache-control', 'private, max-age=86400');

    return new Response(object.body, { headers });
  },
};
