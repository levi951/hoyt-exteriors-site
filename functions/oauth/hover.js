/**
 * Hover OAuth Callback — CREDENTIALS REMOVED
 * This file is intentionally blank. OAuth token exchange is now handled
 * server-side on Wraybot (164.92.95.204:3003).
 * @see /opt/quoticker-webhook/server.js
 */
export async function onRequestGet(context) {
  return new Response('OAuth setup complete. This endpoint is no longer active.', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}
