// Live cursors: other visitors' pointers drawn over the desktop in real time, plus a presence chip
// in the bar. Anonymous: the server hands each tab a random id and forgets it on disconnect.
// With no API configured this does nothing and the chip stays hidden.
import { load, save, socketUrl } from './api';

/** Cursor colors, dark enough to carry a light label and stand out on the sky and the windows. */
export const CURSOR_COLORS = ['#c92a2a', '#c25e00', '#2b8a3e', '#1971c2', '#6741d9', '#c2255c'];
const COLOR_NAMES = ['Red', 'Orange', 'Green', 'Blue', 'Violet', 'Pink'];

/** At most 15 position updates a second. */
const SEND_GAP = 1000 / 15;
const IDLE_MS = 8000;
const PING_MS = 30_000;
/** Stop retrying after this long without a connection. Coming back to the tab tries again. */
const GIVE_UP_MS = 4 * 60_000;
const MAX_BACKOFF = 30_000;
const FULL_BACKOFF = 60_000;
/** A tab left in the background this long gives up its seat in the room. */
const PARK_MS = 60_000;
const PROFILE_DEBOUNCE = 400;
const MAX_LABEL = 16;
const STORE_KEY = 'bigsky-cursor-v1';
/** Each frame covers this share of the gap to the latest position. */
const SMOOTHING = 0.35;

interface Profile {
  name: string;
  c: number;
}

interface Peer {
  id: string;
  el: HTMLElement;
  label: HTMLElement;
  /** Shown position and target, both normalized to the viewport. */
  x: number;
  y: number;
  tx: number;
  ty: number;
  seen: number;
  placed: boolean;
  idle: boolean;
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compactMq = matchMedia('(max-width: 760px)');
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const validColor = (c: unknown): c is number => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < CURSOR_COLORS.length;

const ARROW = '<svg viewBox="0 0 18 22" aria-hidden="true"><path d="M2 1.5v16.2l4.3-4.1 2.9 6.7 3-1.3-2.9-6.6h6.1z"/></svg>';

const CSS = `
.cursors { position: fixed; inset: 0; z-index: 120; pointer-events: none; overflow: hidden; }
.cursor { position: absolute; left: 0; top: 0; display: flex; align-items: flex-start; will-change: transform; transition: opacity 0.3s ease; }
.cursor.is-idle { opacity: 0; }
.cursor svg { width: 18px; height: 22px; overflow: visible; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); }
.cursor path { fill: var(--cursor); stroke: var(--fg); stroke-width: 1.4; stroke-linejoin: round; }
.cursor-label { margin: 16px 0 0 -2px; padding: 1px 7px; border-radius: 6px; background: var(--cursor); color: var(--fg); font: 700 12px/1.5 var(--font-ui); white-space: nowrap; }
.cursor-label:empty { display: none; }
.bar-presence { display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 9px; border-radius: 7px; color: var(--muted); white-space: nowrap; }
.bar-presence:hover, .bar-presence[aria-expanded='true'] { background: rgb(var(--fg-rgb) / 0.08); color: var(--fg); }
.presence-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--cursor); box-shadow: 0 0 0 1.5px rgb(var(--fg-rgb) / 0.7); }
.presence-pop { position: fixed; z-index: 140; width: 248px; padding: 14px 14px 12px; border-radius: var(--radius); border: 2px solid var(--accent); background: rgb(var(--bg-rgb) / 0.96); color: var(--fg); box-shadow: 0 24px 60px -24px rgb(0 0 0 / 0.6), 0 2px 8px rgb(0 0 0 / 0.16); font-size: 14px; }
.presence-pop .presence-head { display: block; margin: 0 0 4px; padding: 0; color: var(--muted); font-size: 13px; font-weight: 700; }
.presence-pop input[type='text'] { width: 100%; height: 34px; padding: 0 10px; border: 1px solid rgb(var(--fg-rgb) / 0.2); border-radius: 8px; background: rgb(var(--fg-rgb) / 0.06); color: var(--fg); font: inherit; }
.presence-pop input[type='text']:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; border-color: transparent; }
.presence-colors { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; border: 0; }
.presence-colors legend { width: 100%; }
.presence-swatch { position: relative; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; }
.presence-swatch input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.presence-swatch span:first-of-type { width: 22px; height: 22px; border-radius: 50%; background: var(--cursor); }
.presence-swatch input:checked + span { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--fg); }
.presence-swatch input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 5px; }
.presence-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.presence-note { margin-top: 10px; color: var(--muted); font-size: 12.5px; line-height: 1.4; }
@media (max-width: 760px) { .cursors { display: none; } }
@media (prefers-reduced-motion: reduce) { .cursor { transition: none; } }
`;

function loadProfile(): Profile {
  const p = load<Partial<Profile>>(STORE_KEY, {});
  const name = typeof p.name === 'string' ? p.name.slice(0, MAX_LABEL) : '';
  const c = validColor(p.c) ? p.c : Math.floor(Math.random() * CURSOR_COLORS.length);
  return { name, c };
}

export function mountCursors() {
  const url = socketUrl('/cursors');
  if (!url || typeof WebSocket === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const overlay = document.createElement('div');
  overlay.className = 'cursors';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.append(overlay);

  const me = loadProfile();
  save(STORE_KEY, me);
  const peers = new Map<string, Peer>();
  let ws: WebSocket | null = null;
  let myId: string | null = null;
  let count = 0;
  let attempt = 0;
  let failingSince = 0;
  let full = false;
  let parked = false;
  let gaveUp = false;
  let retryTimer = 0;
  let parkTimer = 0;
  let pingTimer = 0;
  let idleTimer = 0;
  let profileTimer = 0;

  // ------------------------------------------------------------ others

  let raf = 0;
  function frame() {
    raf = 0;
    let moving = false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    peers.forEach((p) => {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      if (Math.abs(dx) > 0.0004 || Math.abs(dy) > 0.0004) {
        p.x += dx * SMOOTHING;
        p.y += dy * SMOOTHING;
        moving = true;
      } else {
        p.x = p.tx;
        p.y = p.ty;
      }
      p.el.style.transform = `translate3d(${(p.x * w).toFixed(1)}px, ${(p.y * h).toFixed(1)}px, 0)`;
    });
    if (moving) raf = requestAnimationFrame(frame);
  }
  const paint = () => (raf ||= requestAnimationFrame(frame));

  function setIdle(p: Peer, idle: boolean) {
    if (p.idle === idle) return;
    p.idle = idle;
    p.el.classList.toggle('is-idle', idle);
  }

  function upsert(data: { id?: unknown; name?: unknown; c?: unknown }): Peer | null {
    if (typeof data.id !== 'string' || data.id.length > 16 || data.id === myId) return null;
    let p = peers.get(data.id);
    if (!p) {
      const el = document.createElement('div');
      el.className = 'cursor is-idle';
      el.innerHTML = ARROW;
      const label = document.createElement('span');
      label.className = 'cursor-label';
      el.append(label);
      overlay.append(el);
      p = { id: data.id, el, label, x: 0, y: 0, tx: 0, ty: 0, seen: 0, placed: false, idle: true };
      peers.set(data.id, p);
    }
    if (typeof data.name === 'string') p.label.textContent = data.name.slice(0, MAX_LABEL);
    if (validColor(data.c)) p.el.style.setProperty('--cursor', CURSOR_COLORS[data.c]);
    return p;
  }

  function moveTo(id: unknown, x: unknown, y: unknown) {
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const p = upsert({ id });
    if (!p) return;
    p.tx = clamp01(x);
    p.ty = clamp01(y);
    p.seen = Date.now();
    // The first sighting jumps straight there, and so does every move with reduced motion.
    if (!p.placed || reducedMotion.matches) {
      p.x = p.tx;
      p.y = p.ty;
      p.placed = true;
    }
    setIdle(p, false);
    paint();
  }

  function remove(id: unknown) {
    if (typeof id !== 'string') return;
    peers.get(id)?.el.remove();
    peers.delete(id);
  }

  function dropAll() {
    peers.forEach((p) => p.el.remove());
    peers.clear();
    myId = null;
    meIdle = true;
    window.clearInterval(pingTimer);
    window.clearInterval(idleTimer);
    if (chip) {
      closePop(false);
      chip.hidden = true;
    }
  }

  // ------------------------------------------------------------ socket

  function send(msg: object) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  const sendProfile = () => send({ t: 'me', name: me.name, c: me.c });

  function onMessage(data: unknown) {
    if (typeof data !== 'string' || data === 'pong') return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    switch (msg?.t) {
      case 'welcome':
        myId = typeof msg.id === 'string' ? msg.id : null;
        attempt = 0;
        failingSince = 0;
        if (Array.isArray(msg.peers)) {
          for (const peer of msg.peers) {
            upsert(peer);
            if (peer && typeof peer.x === 'number') moveTo(peer.id, peer.x, peer.y);
          }
        }
        setCount(msg.n);
        window.clearInterval(pingTimer);
        window.clearInterval(idleTimer);
        // Keepalive, answered by the server without waking it.
        pingTimer = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
        idleTimer = window.setInterval(() => {
          const now = Date.now();
          peers.forEach((p) => now - p.seen > IDLE_MS && setIdle(p, true));
        }, 1000);
        if (chip) chip.hidden = false;
        break;
      case 'join':
        upsert(msg);
        setCount(msg.n);
        break;
      case 'peer':
        upsert(msg);
        break;
      case 'm':
        if (Array.isArray(msg.p)) for (const row of msg.p) if (Array.isArray(row)) moveTo(row[0], row[1], row[2]);
        break;
      case 'idle': {
        const p = typeof msg.id === 'string' ? peers.get(msg.id) : undefined;
        if (p) setIdle(p, true);
        break;
      }
      case 'leave':
        remove(msg.id);
        setCount(msg.n);
        break;
      case 'full':
        full = true;
        break;
    }
  }

  function connect() {
    if (ws || parked || gaveUp || document.hidden) return;
    window.clearTimeout(retryTimer);
    let sock: WebSocket;
    try {
      sock = new WebSocket(url!);
    } catch {
      return retry();
    }
    ws = sock;
    sock.addEventListener('open', sendProfile);
    sock.addEventListener('message', (e) => onMessage(e.data));
    sock.addEventListener('close', () => {
      if (ws !== sock) return;
      ws = null;
      dropAll();
      retry();
    });
  }

  /** Exponential backoff with jitter. A full room waits longer. */
  function retry() {
    if (parked) return;
    const now = Date.now();
    failingSince ||= now;
    if (now - failingSince > GIVE_UP_MS) {
      gaveUp = true;
      return;
    }
    const base = full ? FULL_BACKOFF : Math.min(MAX_BACKOFF, 1000 * 2 ** attempt);
    full = false;
    attempt++;
    retryTimer = window.setTimeout(connect, base * (0.75 + Math.random() * 0.5));
  }

  function park() {
    parked = true;
    const sock = ws;
    ws = null;
    sock?.close(1000, 'Away');
    dropAll();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      sendIdle();
      parkTimer = window.setTimeout(park, PARK_MS);
      return;
    }
    window.clearTimeout(parkTimer);
    if (parked || gaveUp) {
      parked = false;
      gaveUp = false;
      failingSince = 0;
      attempt = 0;
    }
    connect();
  });

  // ------------------------------------------------------------ own cursor

  let pending: [number, number] | null = null;
  let lastSent = 0;
  let sendTimer = 0;
  let meIdle = true;
  const connected = () => ws?.readyState === WebSocket.OPEN && !!myId;
  /** Positions are shared only from a visible tab on the desktop layout; phones get a home screen. */
  const live = () => connected() && !document.hidden && !compactMq.matches;

  function flushMove() {
    sendTimer = 0;
    if (!pending || !live()) return;
    send({ t: 'm', x: pending[0], y: pending[1] });
    pending = null;
    lastSent = performance.now();
    meIdle = false;
  }

  /** Tell the room to hide our cursor: the tab went to the background or the pointer left the window. */
  function sendIdle() {
    if (meIdle || !connected()) return;
    meIdle = true;
    pending = null;
    send({ t: 'idle' });
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      // Touch has no hovering pointer to share.
      if (e.pointerType === 'touch' || !live()) return;
      pending = [round4(clamp01(e.clientX / window.innerWidth)), round4(clamp01(e.clientY / window.innerHeight))];
      const wait = SEND_GAP - (performance.now() - lastSent);
      if (wait <= 0) flushMove();
      else sendTimer ||= window.setTimeout(flushMove, wait);
    },
    { passive: true },
  );
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) sendIdle();
  });
  compactMq.addEventListener('change', () => compactMq.matches && sendIdle());
  window.addEventListener('resize', paint);

  // ------------------------------------------------------------ presence chip

  const chip = document.querySelector<HTMLButtonElement>('#bar-presence');
  let pop: HTMLElement | null = null;
  let labelInput: HTMLInputElement | null = null;

  function setCount(n: unknown) {
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0) count = n;
    renderChip();
  }

  function renderChip() {
    if (!chip) return;
    const text = count <= 1 ? 'Just you' : `${count} here`;
    chip.querySelector('.presence-n')!.textContent = text;
    chip.setAttribute('aria-label', `${count <= 1 ? 'Just you here' : `${count} people here`}. Set your cursor label and color.`);
    chip.style.setProperty('--cursor', CURSOR_COLORS[me.c]);
  }

  function placePop() {
    if (!chip || !pop) return;
    const r = chip.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.round(Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8))}px`;
  }

  function openPop() {
    if (!chip || !pop || !labelInput) return;
    pop.hidden = false;
    chip.setAttribute('aria-expanded', 'true');
    labelInput.value = me.name;
    pop.querySelector<HTMLInputElement>(`input[value="${me.c}"]`)!.checked = true;
    placePop();
    labelInput.focus();
  }

  function closePop(returnFocus: boolean) {
    if (!chip || !pop || pop.hidden) return;
    pop.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
    if (returnFocus) chip.focus();
  }

  function changed() {
    save(STORE_KEY, me);
    renderChip();
    window.clearTimeout(profileTimer);
    profileTimer = window.setTimeout(sendProfile, PROFILE_DEBOUNCE);
  }

  if (chip) {
    chip.classList.add('bar-presence');
    chip.type = 'button';
    chip.title = 'Your cursor';
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.setAttribute('aria-expanded', 'false');
    chip.setAttribute('aria-controls', 'presence-pop');
    chip.innerHTML = '<span class="presence-dot" aria-hidden="true"></span><span class="presence-n"></span>';
    renderChip();

    // Static markup only; the label goes in through .value.
    pop = document.createElement('div');
    pop.className = 'presence-pop';
    pop.id = 'presence-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Your cursor');
    pop.hidden = true;
    pop.innerHTML = `
      <label><span class="presence-head">Label</span><input type="text" maxlength="${MAX_LABEL}" placeholder="No label" autocomplete="off" spellcheck="false"></label>
      <fieldset class="presence-colors">
        <legend class="presence-head">Color</legend>
        ${CURSOR_COLORS.map(
          (hex, i) =>
            `<label class="presence-swatch" title="${COLOR_NAMES[i]}"><input type="radio" name="presence-color" value="${i}"><span style="--cursor: ${hex}" aria-hidden="true"></span><span class="presence-sr">${COLOR_NAMES[i]}</span></label>`,
        ).join('')}
      </fieldset>
      <p class="presence-note">Shown next to your cursor. Nothing is stored on the server.</p>`;
    document.body.append(pop);
    labelInput = pop.querySelector<HTMLInputElement>('input[type="text"]')!;

    labelInput.addEventListener('input', () => {
      me.name = labelInput!.value.slice(0, MAX_LABEL);
      changed();
    });
    pop.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((r) =>
      r.addEventListener('change', () => {
        me.c = Number(r.value);
        changed();
      }),
    );
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePop(true);
      }
    });
    // Focus leaving for somewhere else (the lock screen, a window) closes it.
    pop.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (to && !pop!.contains(to) && to !== chip) closePop(false);
    });
    document.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Node;
        if (pop && !pop.hidden && !pop.contains(t) && !chip.contains(t)) closePop(false);
      },
      true,
    );
    chip.addEventListener('click', () => (pop!.hidden ? openPop() : closePop(true)));
    window.addEventListener('resize', placePop);
  }

  connect();
}
