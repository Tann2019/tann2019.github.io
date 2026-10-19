// Small HTTP helpers: JSON responses, CORS and request identity.
import type { Env } from './env';

/** The request's Origin if it's on the allow list, else null. */
export function allowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null;
  const list = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  return list.includes(origin) ? origin : null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Errors carry one short sentence the site can show as is. */
export function fail(status: number, message: string, headers: Record<string, string> = {}): Response {
  return json({ error: message }, status, headers);
}

const encoder = new TextEncoder();

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(text));
}

/** A salted SHA-256 of the client IP. The raw IP never leaves this function. */
export async function clientKey(request: Request, salt: string): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const bytes = new Uint8Array(await sha256(`${salt}|${ip}`));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time check of the Bearer token against ADMIN_TOKEN. */
export async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '');
  if (!m || !env.ADMIN_TOKEN) return false;
  // Hashing first gives both sides the same length, which timingSafeEqual requires.
  const [a, b] = await Promise.all([sha256(m[1]), sha256(env.ADMIN_TOKEN)]);
  return crypto.subtle.timingSafeEqual(a, b);
}
