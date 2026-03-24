/**
 * Cloudflare Pages Function — Hover OAuth Callback
 * TEMPORARY — delete this file after capturing tokens
 * Route: GET /oauth/hover?code=XXX
 */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(`OAuth error: ${error}`, { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  if (!code) {
    return new Response('No authorization code received.', { status: 400 });
  }

  // Exchange code for tokens — server-side, no CORS
  const tokenRes = await fetch('https://hover.to/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: '947ef5f5c1f621241cf146dccd68751339f4462d3a200705fe46290602ee4301',
      client_secret: '3038bf2336484533f515ed27542a732b032623d8aeef8b8ad11bbdea7759091420855c881204c24cb2169b16d054f74a',
      redirect_uri: 'https://hoytexteriors.com/oauth/hover',
      code: code,
    }).toString(),
  });

  const tokens = await tokenRes.json();

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Hover OAuth — Tokens</title>
  <style>
    body { background: #0a0a0a; color: #fff; font-family: monospace; padding: 40px; }
    h2 { color: #C41E3A; }
    pre { background: #111; border: 1px solid #333; padding: 20px; border-radius: 8px; white-space: pre-wrap; word-break: break-all; }
    .warn { color: #f59e0b; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <h2>✅ Hover OAuth Tokens</h2>
  <p>Copy these — Claude will save them to the server config.</p>
  <pre id="tokens">${JSON.stringify(tokens, null, 2)}</pre>
  <p class="warn">⚠️ Save these now. This page will be removed after setup.</p>
</body>
</html>`;

  return new Response(html, {
    status: tokenRes.ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html' },
  });
}
