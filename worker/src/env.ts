import type { CursorRoom } from './room';

export interface Env {
  DB: D1Database;
  /** Rate limit stamps, keyed by a salted hash of the client IP. */
  RATE: KVNamespace;
  CURSORS: DurableObjectNamespace<CursorRoom>;
  /** Comma-separated origins allowed to call the API. */
  ALLOWED_ORIGINS: string;
  /** Secret. Bearer token for moderation endpoints. */
  ADMIN_TOKEN?: string;
  /** Secret. Salt for hashing client IPs; raw IPs are never stored. */
  IP_SALT?: string;
  /** Secret, optional. Extra blocked words, comma separated. */
  BLOCKLIST?: string;
}
