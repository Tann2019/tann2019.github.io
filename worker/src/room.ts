// CursorRoom: one Durable Object that relays live cursor positions between visitors.
// Uses the WebSocket Hibernation API, so a quiet room sleeps and costs nothing.
// Nothing is written to storage. Ids are random per connection and vanish on disconnect.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { cleanText, isBlocked } from './text';

const MAX_PEERS = 50;
/** Tabs per visitor (salted IP hash), so one person can't fill the room. */
const MAX_PER_CLIENT = 4;
const MAX_MESSAGE = 200;
/** Clients send at most every 66 ms. Moves arriving faster are dropped. */
const MIN_MOVE_GAP = 45;
/** Clients debounce label edits. Anything faster counts against them. */
const MIN_PROFILE_GAP = 250;
/** Every message spends a token from a per-socket bucket: 20 a second, bursts of 40. Clients need about 15. */
const MSGS_PER_SEC = 20;
const MSG_BURST = 40;
/** Moves are batched into one broadcast per tick, not one per sender. */
const TICK = 50;
const IDLE_MS = 8000;
const MAX_STRIKES = 20;
const COLORS = 6;

interface Peer {
  id: string;
  name: string;
  /** Index into the client's six cursor colors. */
  c: number;
}

const peerOf = (ws: WebSocket) => ws.deserializeAttachment() as Peer | null;

/** A coordinate normalized to the viewport, rounded so messages stay small. */
function coord(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 10000) / 10000 : null;
}

export class CursorRoom extends DurableObject<Env> {
  /** Last known positions. Memory only: lost on hibernation, which only happens once everyone is idle. */
  private positions = new Map<string, { x: number; y: number; at: number }>();
  private pending = new Map<string, [number, number]>();
  private lastMove = new WeakMap<WebSocket, number>();
  private lastProfile = new WeakMap<WebSocket, number>();
  private strikes = new WeakMap<WebSocket, number>();
  /** Memory only, like the rest: buckets start full again after hibernation. */
  private buckets = new WeakMap<WebSocket, { tokens: number; at: number }>();
  private gone = new WeakSet<WebSocket>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const client = request.headers.get('X-Client') ?? 'anon';
    const [socket, server] = Object.values(new WebSocketPair());
    const others = this.open();

    if (others.length >= MAX_PEERS || this.ctx.getWebSockets(client).length >= MAX_PER_CLIENT) {
      // Accept just long enough to say why, outside hibernation, then hang up.
      server.accept();
      server.send(JSON.stringify({ t: 'full' }));
      server.close(4001, 'Room full');
      return new Response(null, { status: 101, webSocket: socket });
    }

    const peer: Peer = { id: crypto.randomUUID().slice(0, 8), name: '', c: Math.floor(Math.random() * COLORS) };
    this.ctx.acceptWebSocket(server, [client]);
    server.serializeAttachment(peer);

    const now = Date.now();
    const peers = others.flatMap((ws) => {
      const p = peerOf(ws);
      if (!p) return [];
      const pos = this.positions.get(p.id);
      return [pos && now - pos.at < IDLE_MS ? { ...p, x: pos.x, y: pos.y } : p];
    });
    const n = others.length + 1;
    server.send(JSON.stringify({ t: 'welcome', id: peer.id, n, peers }));
    this.broadcast({ t: 'join', ...peer, n }, server);
    return new Response(null, { status: 101, webSocket: socket });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (this.gone.has(ws)) return;
    const now = Date.now();
    if (!this.take(ws, now)) return this.strike(ws);
    const peer = peerOf(ws);
    if (!peer || typeof message !== 'string' || message.length > MAX_MESSAGE) return this.strike(ws);
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(message);
      if (!msg || typeof msg !== 'object') throw new Error('not an object');
    } catch {
      return this.strike(ws);
    }

    switch (msg.t) {
      case 'm': {
        const x = coord(msg.x);
        const y = coord(msg.y);
        if (x === null || y === null) return this.strike(ws);
        if (now - (this.lastMove.get(ws) ?? 0) < MIN_MOVE_GAP) return;
        this.lastMove.set(ws, now);
        this.positions.set(peer.id, { x, y, at: now });
        this.pending.set(peer.id, [x, y]);
        this.timer ??= setTimeout(() => this.flush(), TICK);
        return;
      }
      case 'me': {
        if (now - (this.lastProfile.get(ws) ?? 0) < MIN_PROFILE_GAP) return this.strike(ws);
        this.lastProfile.set(ws, now);
        const name = cleanText(msg.name, 16);
        const c = typeof msg.c === 'number' && Number.isInteger(msg.c) && msg.c >= 0 && msg.c < COLORS ? msg.c : peer.c;
        const next: Peer = { ...peer, name: name && !isBlocked(name, this.env.BLOCKLIST) ? name : '', c };
        ws.serializeAttachment(next);
        this.broadcast({ t: 'peer', ...next }, ws);
        return;
      }
      case 'idle':
        // Only news if there was a cursor to hide.
        if (!this.positions.delete(peer.id)) return;
        this.pending.delete(peer.id);
        this.broadcast({ t: 'idle', id: peer.id }, ws);
        return;
      default:
        this.strike(ws);
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.leave(ws);
  }

  /** Sockets that can still hear us. */
  private open() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN && !this.gone.has(ws));
  }

  private send(ws: WebSocket, data: string) {
    try {
      ws.send(data);
    } catch {
      // It closed between the check and the send; webSocketClose cleans up.
    }
  }

  private broadcast(msg: object, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const ws of this.open()) if (ws !== except) this.send(ws, data);
  }

  private flush() {
    this.timer = null;
    if (!this.pending.size) return;
    // Senders get their own position back too; clients skip their own id.
    const data = JSON.stringify({ t: 'm', p: [...this.pending].map(([id, [x, y]]) => [id, x, y]) });
    this.pending.clear();
    for (const ws of this.open()) this.send(ws, data);
  }

  /** Spend one token from the socket's bucket. False once it's empty. */
  private take(ws: WebSocket, now: number) {
    const b = this.buckets.get(ws) ?? { tokens: MSG_BURST, at: now };
    b.tokens = Math.min(MSG_BURST, b.tokens + ((now - b.at) / 1000) * MSGS_PER_SEC);
    b.at = now;
    this.buckets.set(ws, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** Malformed, oversized or too-frequent messages. Enough of them and the socket goes. */
  private strike(ws: WebSocket) {
    const n = (this.strikes.get(ws) ?? 0) + 1;
    this.strikes.set(ws, n);
    if (n <= MAX_STRIKES) return;
    try {
      ws.close(1008, 'Too many bad messages');
    } catch {
      // Already closed.
    }
    this.leave(ws);
  }

  private leave(ws: WebSocket) {
    if (this.gone.has(ws)) return;
    this.gone.add(ws);
    const peer = peerOf(ws);
    try {
      // Needed on older compatibility dates to finish the close handshake; ignored on newer ones.
      ws.close(1000, 'Bye');
    } catch {
      // Already closed.
    }
    if (!peer) return;
    this.positions.delete(peer.id);
    this.pending.delete(peer.id);
    this.broadcast({ t: 'leave', id: peer.id, n: this.open().length });
  }
}
