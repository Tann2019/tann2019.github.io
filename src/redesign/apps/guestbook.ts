// Sticky notes: visitors draw a small note and pin it to a shared wall.
// With the Big Sky API configured the wall is shared. Without it, or when it's down, notes live
// in this browser and a banner says so. Everything else behaves the same either way.
import { API_BASE, ApiError, api, load, prefersReducedMotion, save } from './api';

/** The drawing's backing store: twice the 240×180 logical size, so strokes stay crisp. */
const W = 480;
const H = 360;
/** Exported drawings stay under this; the server accepts up to 60 KB. */
const MAX_PNG_BYTES = 40 * 1024;
const PAGE = 24;
const PAPERS = ['butter', 'mint', 'sky', 'blush'];
const NOTES_KEY = 'bigsky-notes-v1';
const AUTHOR_KEY = 'bigsky-note-author-v1';
const MAX_LOCAL = 40;
const MAX_UNDO = 50;
/** Arrow keys move the pen this far, in backing-store pixels. */
const KEY_STEP = 6;
/** Arrow presses closer together than this extend the same stroke, so one Undo takes back one line. */
const KEY_STROKE_GAP = 800;
/** Reopening the window after this long fetches the wall again. */
const STALE_MS = 2 * 60 * 1000;

export interface Note {
  id: number | string;
  created_at: string;
  name: string;
  place: string;
  message: string;
  paper: string;
  image: string | null;
}

type Draft = Omit<Note, 'id' | 'created_at'>;

interface Stroke {
  erase: boolean;
  color: string;
  size: number;
  /** Flat x, y pairs in backing-store pixels. */
  pts: number[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function isNote(n: unknown): n is Note {
  const o = n as Note | null;
  return (
    !!o &&
    (typeof o.id === 'number' || typeof o.id === 'string') &&
    typeof o.created_at === 'string' &&
    typeof o.name === 'string' &&
    typeof o.place === 'string' &&
    typeof o.message === 'string' &&
    typeof o.paper === 'string' &&
    (o.image === null || typeof o.image === 'string')
  );
}

/** A stable lean between -3° and 3° from the note's id, so it hangs the same way for everyone. */
function tilt(id: Note['id']): number {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (((h >>> 0) % 13) - 6) / 2;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const sameYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const otherYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function ago(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const s = (then - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  const d = new Date(then);
  return (d.getFullYear() === new Date().getFullYear() ? sameYear : otherYear).format(d);
}

/** Decoded size of a base64 data URL, near enough. */
const dataUrlBytes = (url: string) => Math.ceil(((url.length - url.indexOf(',') - 1) * 3) / 4);

function noteEl(n: Note, fresh = false): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'gb-note';
  li.dataset.paper = PAPERS.includes(n.paper) ? n.paper : PAPERS[0];
  li.style.setProperty('--tilt', `${tilt(n.id)}deg`);
  li.tabIndex = -1;
  const who = n.name || 'Anonymous';

  // Only PNG data URLs, whatever the source says. Nothing user-supplied goes through innerHTML.
  if (n.image?.startsWith('data:image/png;base64,')) {
    const img = new Image(240, 180);
    img.src = n.image;
    img.alt = `Drawing by ${who}`;
    img.decoding = 'async';
    img.loading = 'lazy';
    li.append(img);
  }
  if (n.message) {
    const p = document.createElement('p');
    p.className = 'gb-note-msg';
    p.textContent = n.message;
    li.append(p);
  }
  const by = document.createElement('p');
  by.className = 'gb-note-by';
  const name = document.createElement('span');
  name.textContent = n.place ? `${who}, ${n.place}` : who;
  const time = document.createElement('time');
  time.dateTime = n.created_at;
  time.textContent = ago(n.created_at);
  time.title = new Date(n.created_at).toLocaleString();
  by.append(name, time);
  li.append(by);
  if (fresh && !prefersReducedMotion()) li.classList.add('is-new');
  return li;
}

export function mountGuestbook(root: HTMLElement) {
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const tabs = [q<HTMLButtonElement>('#gb-tab-wall'), q<HTMLButtonElement>('#gb-tab-new')];
  const panels = [q('#gb-wall'), q('#gb-new')];
  const banner = q('.gb-banner');
  const wall = q<HTMLOListElement>('.gb-wall');
  const loading = q('.gb-loading');
  const empty = q('.gb-empty');
  const wallStatus = q('.gb-wall-status');
  const moreBtn = q<HTMLButtonElement>('.gb-more');
  const pad = q('.gb-pad');
  const canvas = q<HTMLCanvasElement>('.gb-canvas');
  const pen = q('.gb-pen');
  const eraserBtn = q<HTMLButtonElement>('[data-gb="eraser"]');
  const undoBtn = q<HTMLButtonElement>('[data-gb="undo"]');
  const clearBtn = q<HTMLButtonElement>('[data-gb="clear"]');
  const form = q<HTMLFormElement>('.gb-form');
  const pinBtn = q<HTMLButtonElement>('.gb-form [type="submit"]');
  const status = q('.gb-status');
  const count = q('.gb-count');
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
  const nameInput = field('name');
  const placeInput = field('place');
  const messageInput = field('message');
  const ctx = canvas.getContext('2d')!;
  const checked = (name: string) => root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;

  let shared = !!API_BASE;
  let local: Note[] = load<unknown[]>(NOTES_KEY, []).filter(isNote);
  let shown: Note[] = [];
  let more = false;
  let loadedAt = 0;
  let loadingWall = false;
  let posting = false;

  // ------------------------------------------------------------- tabs

  function selectTab(i: number, focus = false) {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      t.toggleAttribute('data-autofocus', on);
      panels[k].hidden = !on;
    });
    if (focus) tabs[i].focus();
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(i));
    t.addEventListener('keydown', (e) => {
      const keys: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      selectTab((keys[e.key] + tabs.length) % tabs.length, true);
    });
  });

  // ------------------------------------------------------------- wall

  function goLocal() {
    shared = false;
    banner.hidden = false;
  }

  function render(list: Note[], append: boolean) {
    if (!append) {
      wall.replaceChildren();
      shown = [];
    }
    const frag = document.createDocumentFragment();
    list.forEach((n) => frag.append(noteEl(n)));
    wall.append(frag);
    shown.push(...list);
    empty.hidden = shown.length > 0;
    moreBtn.hidden = !more;
  }

  function showLocal(append: boolean) {
    const start = append ? shown.length : 0;
    more = local.length > start + PAGE;
    render(local.slice(start, start + PAGE), append);
  }

  async function loadWall(append = false) {
    if (loadingWall) return;
    loadingWall = true;
    wallStatus.textContent = '';
    loading.hidden = append || shown.length > 0;
    try {
      if (!shared) showLocal(append);
      else {
        const last = shown[shown.length - 1];
        const before = append && last ? `&before=${encodeURIComponent(String(last.id))}` : '';
        try {
          const res = await api<{ notes: unknown[]; more: boolean }>(`/notes?limit=${PAGE}${before}`);
          more = !!res.more;
          render(res.notes.filter(isNote), append);
        } catch {
          if (append) wallStatus.textContent = 'Couldn’t load more. Try again.';
          else {
            goLocal();
            showLocal(false);
          }
        }
      }
      loadedAt = Date.now();
    } finally {
      loadingWall = false;
      loading.hidden = true;
    }
  }

  function refreshTimes() {
    wall.querySelectorAll('time').forEach((t) => (t.textContent = ago(t.dateTime)));
  }

  moreBtn.addEventListener('click', async () => {
    const before = shown.length;
    await loadWall(true);
    // The button hides on the last page; keep focus on the first note that just arrived.
    if (moreBtn.hidden) wall.querySelectorAll<HTMLElement>('.gb-note')[before]?.focus();
  });

  q('[data-gb="first"]').addEventListener('click', () => {
    selectTab(1);
    canvas.focus({ preventScroll: true });
  });

  // ---------------------------------------------------------- drawing

  let strokes: Stroke[] = [];
  const history: Stroke[][] = [];
  let erasing = false;
  let keyStroke: Stroke | null = null;
  let lastKey = 0;
  let penX = W / 2;
  let penY = H / 2;

  function paint(s: Stroke, from = 0) {
    const p = s.pts;
    ctx.save();
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (p.length === 2) {
      ctx.arc(p[0], p[1], s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // From the point before `from`, so live drawing only adds the newest segment.
      const i0 = Math.max(0, from - 2);
      ctx.moveTo(p[i0], p[i0 + 1]);
      for (let i = i0 + 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function syncTools() {
    undoBtn.disabled = !history.length;
    clearBtn.disabled = !strokes.length;
  }

  function redraw() {
    ctx.clearRect(0, 0, W, H);
    strokes.forEach((s) => paint(s));
    syncTools();
  }

  function commit(next: Stroke[]) {
    history.push(strokes);
    if (history.length > MAX_UNDO) history.shift();
    strokes = next;
    syncTools();
  }

  function begin(x: number, y: number): Stroke {
    const size = Number(checked('gb-size') ?? 4);
    const s: Stroke = { erase: erasing, color: checked('gb-ink') ?? '#2b2f3a', size: erasing ? size * 3 : size, pts: [x, y] };
    commit([...strokes, s]);
    paint(s);
    return s;
  }

  function extend(s: Stroke, x: number, y: number) {
    const n = s.pts.length;
    if (Math.hypot(x - s.pts[n - 2], y - s.pts[n - 1]) < 1) return;
    s.pts.push(x, y);
    paint(s, n);
  }

  function undo() {
    if (!history.length) return;
    strokes = history.pop()!;
    keyStroke = null;
    redraw();
  }

  function clear() {
    if (!strokes.length) return;
    commit([]);
    keyStroke = null;
    redraw();
  }

  function setEraser(on: boolean) {
    erasing = on;
    keyStroke = null;
    eraserBtn.setAttribute('aria-pressed', String(on));
    canvas.style.cursor = on ? 'cell' : '';
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    pen.hidden = true;
    keyStroke = null;
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    const at = (ev: PointerEvent): [number, number] => [
      clamp(((ev.clientX - r.left) * W) / r.width, 0, W),
      clamp(((ev.clientY - r.top) * H) / r.height, 0, H),
    ];
    const s = begin(...at(e));
    const move = (ev: PointerEvent) => {
      const events = ev.getCoalescedEvents?.() ?? [];
      for (const c of events.length ? events : [ev]) extend(s, ...at(c));
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  });

  // Keyboard drawing: a pen marker you steer with the arrow keys.
  function placePen() {
    pen.hidden = false;
    pen.style.left = `${(penX / W) * 100}%`;
    pen.style.top = `${(penY / H) * 100}%`;
  }

  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  canvas.addEventListener('keydown', (e) => {
    const d = ARROWS[e.key];
    if (!d || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const x = clamp(penX + d[0] * KEY_STEP, 0, W);
    const y = clamp(penY + d[1] * KEY_STEP, 0, H);
    if (e.shiftKey) keyStroke = null;
    else {
      const now = performance.now();
      if (!keyStroke || now - lastKey > KEY_STROKE_GAP) keyStroke = begin(penX, penY);
      lastKey = now;
      extend(keyStroke, x, y);
    }
    penX = x;
    penY = y;
    placePen();
  });

  canvas.addEventListener('focus', () => {
    if (canvas.matches(':focus-visible')) placePen();
  });
  canvas.addEventListener('blur', () => {
    pen.hidden = true;
    keyStroke = null;
  });

  eraserBtn.addEventListener('click', () => setEraser(!erasing));
  undoBtn.addEventListener('click', undo);
  clearBtn.addEventListener('click', clear);
  root.querySelectorAll<HTMLInputElement>('input[name="gb-ink"]').forEach((i) => i.addEventListener('change', () => setEraser(false)));
  root.querySelectorAll<HTMLInputElement>('input[name="gb-size"]').forEach((i) => i.addEventListener('change', () => (keyStroke = null)));
  root.querySelectorAll<HTMLInputElement>('input[name="gb-paper"]').forEach((i) =>
    i.addEventListener('change', () => (pad.dataset.paper = checked('gb-paper') ?? PAPERS[0])),
  );

  panels[1].addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement).matches('input[type="text"], textarea')) {
      e.preventDefault();
      undo();
    }
  });

  /** True when something visible is left on the canvas; erasing everything counts as blank. */
  function hasInk() {
    if (!strokes.some((s) => !s.erase)) return false;
    const px = ctx.getImageData(0, 0, W, H).data;
    for (let i = 3; i < px.length; i += 4) if (px[i]) return true;
    return false;
  }

  /** The drawing as a transparent PNG, downscaled until it's small enough. Null when blank. */
  function exportDrawing(): string | null {
    if (!hasInk()) return null;
    const out = document.createElement('canvas');
    const octx = out.getContext('2d')!;
    let url = '';
    for (const scale of [1, 0.75, 0.5, 0.375]) {
      out.width = Math.round(W * scale);
      out.height = Math.round(H * scale);
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(canvas, 0, 0, out.width, out.height);
      url = out.toDataURL('image/png');
      if (dataUrlBytes(url) <= MAX_PNG_BYTES) break;
    }
    return url;
  }

  // ---------------------------------------------------------- posting

  function say(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }

  function updateCount() {
    count.textContent = `${messageInput.value.length}/140`;
  }

  function keepLocal(d: Draft): Note {
    const note: Note = {
      id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      created_at: new Date().toISOString(),
      ...d,
    };
    local = [note, ...local].slice(0, MAX_LOCAL);
    // Drop the oldest until it fits. With storage blocked the note lasts until the page closes.
    const list = local.slice();
    while (list.length && !save(NOTES_KEY, list)) list.pop();
    return note;
  }

  /** Put the new note at the top of the wall and take the visitor there. */
  function pinned(note: Note, rerender: boolean) {
    strokes = [];
    history.length = 0;
    redraw();
    setEraser(false);
    messageInput.value = '';
    updateCount();
    say('');
    if (rerender) showLocal(false);
    else {
      shown.unshift(note);
      wall.prepend(noteEl(note));
      empty.hidden = true;
    }
    const el = wall.firstElementChild as HTMLElement | null;
    if (el && !prefersReducedMotion()) el.classList.add('is-new');
    selectTab(0);
    el?.focus({ preventScroll: true });
    root.closest('.win-body')?.scrollTo({ top: 0 });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (posting) return;
    const draft: Draft = {
      name: nameInput.value.trim(),
      place: placeInput.value.trim(),
      message: messageInput.value.trim(),
      paper: checked('gb-paper') ?? PAPERS[0],
      image: exportDrawing(),
    };
    if (!draft.image && !draft.message) return say('Draw something or write a message.', true);
    save(AUTHOR_KEY, { name: draft.name, place: draft.place });

    posting = true;
    pinBtn.disabled = true;
    pinBtn.textContent = 'Pinning…';
    say('');
    try {
      if (!shared) return pinned(keepLocal(draft), false);
      try {
        const res = await api<{ note: unknown }>('/notes', { method: 'POST', body: JSON.stringify(draft) });
        if (!isNote(res.note)) throw new ApiError(500, 'Bad response.');
        pinned(res.note, false);
      } catch (err) {
        // The server said no: say why and keep the draft.
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return say(err.message, true);
        // Unreachable or broken: fall back to this browser.
        goLocal();
        pinned(keepLocal(draft), true);
      }
    } finally {
      posting = false;
      pinBtn.disabled = false;
      pinBtn.textContent = 'Pin it';
    }
  });

  messageInput.addEventListener('input', updateCount);

  // ------------------------------------------------------------ setup

  const author = load<{ name?: unknown; place?: unknown }>(AUTHOR_KEY, {});
  if (typeof author.name === 'string') nameInput.value = author.name.slice(0, 40);
  if (typeof author.place === 'string') placeInput.value = author.place.slice(0, 40);
  banner.hidden = shared;
  updateCount();
  syncTools();

  // The wall loads when the window first opens, and again if it has gone stale.
  const onOpen = () => {
    if (!loadedAt || Date.now() - loadedAt > STALE_MS) loadWall(false);
    else refreshTimes();
  };
  const win = root.closest<HTMLElement>('.win');
  win?.addEventListener('win:open', onOpen);
  win?.addEventListener('win:restore', onOpen);
  // A #guestbook deep link can open the window before this runs.
  if (win && !win.hidden && !win.closest('#win-pool')) onOpen();
}
