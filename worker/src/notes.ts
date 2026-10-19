// Guestbook notes: list, create, and two moderation actions. Stored in D1.
import type { Env } from './env';
import { clientKey, fail, isAdmin, json } from './http';
import { cleanText, hasLink, isBlocked } from './text';

export const PAPERS = ['butter', 'mint', 'sky', 'blush'];

const PAGE = 24;
const MAX_PAGE = 48;
const MAX_BODY = 100_000;
const MAX_IMAGE_BYTES = 60 * 1024;
/** Largest drawing we'll accept, in pixels per side. Stops tiny files that inflate into huge bitmaps. */
const MAX_SIDE = 600;
const RATE_SECONDS = 60;
const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface NoteRow {
  id: number;
  created_at: string;
  name: string;
  place: string;
  message: string;
  paper: string;
  image: string | null;
}

const COLUMNS = 'id, created_at, name, place, message, paper, image';

/** GET /notes?before=<id>&limit=24. Visible notes, newest first. */
export async function listNotes(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const limit = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '', 10) || PAGE));
  const before = Number.parseInt(url.searchParams.get('before') ?? '', 10);
  // One extra row tells us whether there's another page.
  const stmt = before > 0
    ? env.DB.prepare(`SELECT ${COLUMNS} FROM notes WHERE hidden = 0 AND id < ? ORDER BY id DESC LIMIT ?`).bind(before, limit + 1)
    : env.DB.prepare(`SELECT ${COLUMNS} FROM notes WHERE hidden = 0 ORDER BY id DESC LIMIT ?`).bind(limit + 1);
  const { results } = await stmt.all<NoteRow>();
  return json({ notes: results.slice(0, limit), more: results.length > limit }, 200, cors);
}

type ImageCheck = { image: string | null } | { status: number; error: string };

/** A drawing must be a real PNG, small on the wire and small once decoded. */
function checkImage(value: unknown): ImageCheck {
  if (value === undefined || value === null || value === '') return { image: null };
  if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)) return { status: 400, error: 'Drawings must be PNG images.' };
  const b64 = value.slice(PNG_PREFIX.length);
  if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { status: 400, error: 'That drawing is corrupt.' };
  const bytes = (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return { status: 413, error: 'That drawing is too big.' };
  // The first 24 bytes: signature, IHDR length and type, width, height.
  const head = Uint8Array.from(atob(b64.slice(0, 32)), (c) => c.charCodeAt(0));
  if (head.length < 24 || PNG_SIGNATURE.some((b, i) => head[i] !== b)) return { status: 400, error: 'Drawings must be PNG images.' };
  if (String.fromCharCode(...head.slice(12, 16)) !== 'IHDR') return { status: 400, error: 'That drawing is corrupt.' };
  const view = new DataView(head.buffer);
  const w = view.getUint32(16);
  const h = view.getUint32(20);
  if (!w || !h || w > MAX_SIDE || h > MAX_SIDE) return { status: 413, error: 'That drawing is too big.' };
  return { image: value };
}

/** The body as text, or null once it passes MAX_BODY bytes. Chunked uploads have no Content-Length to check first. */
async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** POST /notes. Validates, rate limits by salted IP hash, then stores. */
export async function createNote(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.IP_SALT) return fail(503, 'The wall is not set up yet.', cors);
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) return fail(415, 'Send JSON.', cors);
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return fail(413, 'That note is too big.', cors);

  const raw = await readBody(request);
  if (raw === null) return fail(413, 'That note is too big.', cors);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'Send a JSON object.', cors);
  }

  const name = cleanText(body.name, 40);
  const place = cleanText(body.place, 40);
  const message = cleanText(body.message, 140, true);
  if (name === null) return fail(400, 'Names are 40 characters at most.', cors);
  if (place === null) return fail(400, 'Places are 40 characters at most.', cors);
  if (message === null) return fail(400, 'Messages are 140 characters at most.', cors);
  const paper = typeof body.paper === 'string' && PAPERS.includes(body.paper) ? body.paper : null;
  if (!paper) return fail(400, 'Pick a paper color.', cors);
  const img = checkImage(body.image);
  if ('error' in img) return fail(img.status, img.error, cors);
  if (!img.image && !message) return fail(400, 'Draw something or write a message.', cors);

  const text = `${name} ${place} ${message}`;
  if (hasLink(text)) return fail(422, 'Links aren’t allowed.', cors);
  if (isBlocked(text, env.BLOCKLIST)) return fail(422, 'Try different words.', cors);

  // KV is eventually consistent, so two posts in the same instant can both slip through. Fine for a guestbook.
  const stamp = `note:${await clientKey(request, env.IP_SALT)}`;
  try {
    if (await env.RATE.get(stamp)) {
      return fail(429, 'One note a minute. Try again shortly.', { ...cors, 'Retry-After': String(RATE_SECONDS) });
    }
    // Stamp before storing: if KV fails (say, the free plan's daily write cap), the note is refused, not let through unlimited.
    await env.RATE.put(stamp, '1', { expirationTtl: RATE_SECONDS });
  } catch (err) {
    console.error(err);
    return fail(503, 'Try again shortly.', cors);
  }

  const note = await env.DB.prepare(
    `INSERT INTO notes (created_at, name, place, message, paper, image) VALUES (?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
  )
    .bind(new Date().toISOString(), name, place, message, paper, img.image)
    .first<NoteRow>();
  return json({ note }, 201, cors);
}

/** DELETE /notes/:id and POST /notes/:id/hide. Bearer ADMIN_TOKEN only. */
export async function moderate(request: Request, env: Env, id: number, action: 'delete' | 'hide'): Promise<Response> {
  if (!(await isAdmin(request, env))) return fail(401, 'Not allowed.', { 'WWW-Authenticate': 'Bearer' });
  const stmt = action === 'delete'
    ? env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id)
    : env.DB.prepare('UPDATE notes SET hidden = 1 WHERE id = ?').bind(id);
  const { meta } = await stmt.run();
  if (!meta.changes) return fail(404, 'No note with that id.');
  return new Response(null, { status: 204 });
}
