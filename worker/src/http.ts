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

/**
 * IPv6 visitors usually hold a whole /64 and can hop around inside it, so they're keyed by the
 * prefix. IPv4 is keyed by the address, also when it arrives IPv4-mapped. Anything unparseable stays as is.
 */
function ipPrefix(ip: string): string {
  if (!ip.includes(':')) return ip;
  let s = ip.toLowerCase().split('%')[0];
  // A dotted IPv4 tail (::ffff:1.2.3.4) is the last two hextets.
  const v4 = /:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    if (Math.max(a, b, c, d) > 255) return ip;
    s = `${s.slice(0, v4.index)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return ip;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const gap = 8 - head.length - tail.length;
  if (halves.length === 2 ? gap < 1 : gap !== 0) return ip;
  const groups = [...head, ...Array<string>(gap).fill('0'), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  const n = groups.map((g) => Number.parseInt(g, 16));
  if (n.slice(0, 5).every((g) => g === 0) && n[5] === 0xffff) return `${n[6] >> 8}.${n[6] & 255}.${n[7] >> 8}.${n[7] & 255}`;
  return `${n.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/** A salted SHA-256 of the client IP, or its /64 for IPv6. The raw IP never leaves this function. */
export async function clientKey(request: Request, salt: string): Promise<string> {
  const ip = ipPrefix(request.headers.get('CF-Connecting-IP') ?? 'local');
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
