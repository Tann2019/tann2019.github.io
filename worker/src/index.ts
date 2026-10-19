// Big Sky API: guestbook notes and live cursors for the desktop at tannersteorts.com.
//   GET    /notes?before=<id>&limit=24   visible notes, newest first
//   POST   /notes                        pin a note (one a minute per visitor)
//   DELETE /notes/:id                    moderation, Bearer ADMIN_TOKEN
//   POST   /notes/:id/hide               moderation, Bearer ADMIN_TOKEN
//   GET    /cursors                      WebSocket into the shared CursorRoom
import type { Env } from './env';
import { allowedOrigin, clientKey, corsHeaders, fail, json } from './http';
import { createNote, listNotes, moderate } from './notes';

export { CursorRoom } from './room';

/** Hand the socket to the one shared room, with an anonymous client key instead of an IP. */
async function cursors(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'Expected a WebSocket.');
  // Browsers always send Origin on a WebSocket handshake. Only the site itself may join.
  if (!allowedOrigin(request.headers.get('Origin'), env)) return fail(403, 'Origin not allowed.');
  if (!env.IP_SALT) return fail(503, 'Cursors are not set up yet.');
  const headers = new Headers(request.headers);
  headers.set('X-Client', await clientKey(request, env.IP_SALT));
  for (const h of ['CF-Connecting-IP', 'True-Client-IP', 'X-Forwarded-For', 'X-Real-IP']) headers.delete(h);
  return env.CURSORS.getByName('desktop').fetch(new Request(request, { headers }));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const sent = request.headers.get('Origin');
    const origin = allowedOrigin(sent, env);
    const cors = corsHeaders(origin);
    // Pages on other sites get nothing. Tools that send no Origin (curl, the admin) pass through.
    if (sent && !origin) return fail(403, 'Origin not allowed.', { Vary: 'Origin' });

    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname === '/cursors') return await cursors(request, env);

      if (url.pathname === '/notes') {
        if (request.method === 'GET') return await listNotes(url, env, cors);
        if (request.method === 'POST') return await createNote(request, env, cors);
        return fail(405, 'Method not allowed.', { ...cors, Allow: 'GET, POST, OPTIONS' });
      }

      const m = /^\/notes\/(\d{1,12})(\/hide)?$/.exec(url.pathname);
      if (m) {
        const id = Number(m[1]);
        if (!m[2] && request.method === 'DELETE') return await moderate(request, env, id, 'delete');
        if (m[2] && request.method === 'POST') return await moderate(request, env, id, 'hide');
        return fail(405, 'Method not allowed.', cors);
      }

      if (url.pathname === '/') return json({ ok: true }, 200, cors);
      return fail(404, 'Not found.', cors);
    } catch (err) {
      console.error(err);
      return fail(500, 'Something broke. Try again later.', cors);
    }
  },
} satisfies ExportedHandler<Env>;
