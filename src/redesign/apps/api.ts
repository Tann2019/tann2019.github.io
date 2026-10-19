// Client helpers for the optional Big Sky API (a Cloudflare Worker, see worker/README.md).
// Everything that uses it must still work when it's missing or down.

declare global {
  interface ImportMetaEnv {
    /** Base URL of the worker, e.g. https://bigsky-api.example.workers.dev. Unset means local mode. */
    readonly PUBLIC_BIGSKY_API?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const raw = (import.meta.env.PUBLIC_BIGSKY_API ?? '').trim();

/** The API base without a trailing slash, or null when none is configured. */
export const API_BASE: string | null = /^https?:\/\/[^/]/.test(raw) ? raw.replace(/\/+$/, '') : null;

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never got an answer. */
  status: number;
  /** Seconds to wait, from Retry-After, when the server sent one. */
  retryAfter: number | null;

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Fetch JSON from the API. Throws ApiError with the server's one-line message on failure. */
export async function api<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  if (!API_BASE) throw new ApiError(0, 'No API configured.');
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      signal: ctl.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server.');
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // Not JSON: keep the generic message.
    }
    const retry = Number(res.headers.get('Retry-After'));
    throw new ApiError(res.status, message, Number.isFinite(retry) && retry > 0 ? retry : null);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** The WebSocket URL for an API path, or null when no API is configured. */
export function socketUrl(path: string): string | null {
  return API_BASE ? API_BASE.replace(/^http/, 'ws') + path : null;
}

/** Read JSON from localStorage. Private windows and blocked storage fall back quietly. */
export function load<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

/** Write JSON to localStorage. Returns false when storage is full or blocked. */
export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
