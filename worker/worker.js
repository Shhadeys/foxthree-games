export default {
  async fetch(request, env) {
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

    if (!object) {
      return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=86400');

    return new Response(object.body, { headers });
  },
};
