// A floating window manager in the Linux mould: draggable, resizable windows with snapping,
// minimise to a taskbar, maximise, four workspaces, one-click tiling, a launcher and a lock screen.

interface AppDef {
  title: string;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  /** Sticky windows float above the rest and follow you across workspaces. */
  sticky?: boolean;
}

export const APPS: Record<string, AppDef> = {
  terminal: { title: 'tanner@billings: ~', w: 800, h: 480, minW: 380, minH: 220 },
  disdubs: { title: 'DisDubs', w: 780, h: 700 },
  gridiron: { title: 'Gridiron Duels', w: 700, h: 560 },
  mothership: { title: 'DnD Mothership', w: 620, h: 400 },
  work: { title: 'Work history', w: 700, h: 660 },
  side: { title: 'Side projects', w: 660, h: 640 },
  writing: { title: 'Writing', w: 660, h: 580 },
  chess: { title: 'Chess', w: 900, h: 640, minW: 560, minH: 420 },
  synth: { title: 'Synth', w: 620, h: 440, minW: 420, minH: 320 },
  guestbook: { title: 'Sticky notes', w: 720, h: 560, minW: 360, minH: 360 },
  radio: { title: 'lofi radio', w: 480, h: 380, minW: 320, minH: 240, sticky: true },
  sayhi: { title: 'Say hi', w: 440, h: 290, minW: 320, minH: 250, sticky: true },
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WinState {
  ws: number;
  min: boolean;
  /** Where the window was before it was maximised or snapped, so it can go back. */
  restore: Rect | null;
  max: boolean;
}

const GAP = 12;
const MIN_W = 300;
const MIN_H = 200;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compactMq = matchMedia('(max-width: 760px)');
export const isCompact = () => compactMq.matches;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

const state = new Map<string, WinState>();
let current = 1;
let zTop = 10;
let focused: string | null = null;

const win = (id: string) => $(`.win[data-app="${id}"]`);
const wsEl = (n: number) => $(`.ws[data-ws="${n}"]`);

/** Apps listen on their .win element to start and stop audio, sockets and animation. */
function emit(id: string, type: 'win:open' | 'win:close' | 'win:minimize' | 'win:restore') {
  win(id).dispatchEvent(new CustomEvent(type, { detail: { id } }));
}

function barBottom() {
  return $('#bar').getBoundingClientRect().bottom;
}

/** The space windows maximise into and tile across. */
function workArea(): Rect {
  const top = barBottom() + GAP;
  return { x: GAP, y: top, w: window.innerWidth - GAP * 2, h: window.innerHeight - top - GAP };
}

function getRect(el: HTMLElement): Rect {
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}

function setRect(el: HTMLElement, r: Rect) {
  el.style.left = `${Math.round(r.x)}px`;
  el.style.top = `${Math.round(r.y)}px`;
  el.style.width = `${Math.round(r.w)}px`;
  el.style.height = `${Math.round(r.h)}px`;
}

/** Move with a short glide. Dragging and resizing set the rect directly instead. */
function glideTo(el: HTMLElement, r: Rect) {
  if (reducedMotion.matches) return setRect(el, r);
  el.classList.add('is-gliding');
  setRect(el, r);
  window.setTimeout(() => el.classList.remove('is-gliding'), 280);
}

/** Keep at least a grabbable strip of the title bar on screen. */
function clampToScreen(r: Rect): Rect {
  const top = barBottom() + 4;
  return {
    ...r,
    x: Math.min(Math.max(r.x, 80 - r.w), window.innerWidth - 80),
    y: Math.min(Math.max(r.y, top), window.innerHeight - 44),
  };
}

/** New windows open in the open sky between the name on the left and the icons on the right. */
function defaultRect(id: string): Rect {
  const def = APPS[id];
  const area = workArea();
  const w = Math.min(def.w, area.w);
  const h = Math.min(def.h, area.h);
  const conky = document.querySelector('.conky')?.getBoundingClientRect();
  const icons = $$('.dicon').map((el) => el.getBoundingClientRect().left);
  const left = conky ? conky.right + 24 : area.x;
  const right = icons.length ? Math.min(...icons) - 24 : area.x + area.w;
  const free = right - left;
  const visible = [...state.values()].filter((s) => !s.min && (s.ws === current || s.ws === 0)).length;
  const offset = (visible % 6) * 28;
  const x = free >= w ? left + (free - w) / 2 : area.x + (area.w - w) / 2;
  const y = area.y + Math.max(0, Math.min(48, (area.h - h) / 2));
  return clampToScreen({ x: x + offset, y: y + offset, w, h });
}

// ------------------------------------------------------------------- focus

function focusWindow(id: string | null, moveFocus = false) {
  $$('.win.is-focused').forEach((el) => el.classList.remove('is-focused'));
  focused = id;
  if (id) {
    const el = win(id);
    el.classList.add('is-focused');
    el.style.zIndex = String(++zTop);
    if (moveFocus) (el.querySelector<HTMLElement>('[data-autofocus]') ?? el).focus({ preventScroll: true });
  }
  renderTaskbar();
}

export function unfocusAll() {
  focusWindow(null);
}

/** The frontmost visible window on the current workspace. */
function topmost(): string | null {
  let best: string | null = null;
  let bestZ = -1;
  state.forEach((s, id) => {
    if (s.min || (s.ws !== current && s.ws !== 0)) return;
    const z = Number(win(id).style.zIndex || 0);
    if (z > bestZ) {
      bestZ = z;
      best = id;
    }
  });
  return best;
}

// ----------------------------------------------------------------- taskbar

function renderTaskbar() {
  const bar = $('#taskbar');
  bar.innerHTML = '';
  state.forEach((s, id) => {
    if (s.ws !== current && s.ws !== 0) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task';
    btn.dataset.task = id;
    btn.setAttribute('aria-pressed', String(id === focused && !s.min));
    btn.classList.toggle('is-min', s.min);
    const icon = document.querySelector(`.dicon[data-app="${id}"] svg`)?.cloneNode(true);
    if (icon) btn.append(icon);
    const label = document.createElement('span');
    label.textContent = APPS[id].title;
    btn.append(label);
    bar.append(btn);
  });
  $$('[data-ws-btn]').forEach((btn) => {
    const n = Number(btn.dataset.wsBtn);
    if (n === current) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
    btn.classList.toggle('has-windows', [...state.values()].some((s) => s.ws === n));
  });
}

function onTaskClick(id: string) {
  const s = state.get(id)!;
  if (s.min) restoreWindow(id);
  else if (focused === id) minimize(id);
  else focusWindow(id, true);
}

// --------------------------------------------------------------- workspaces

export function switchTo(n: number) {
  if (n < 1 || n > 4 || n === current) return;
  current = n;
  $$('.ws').forEach((el) => {
    const k = Number(el.dataset.ws);
    el.dataset.pos = k < n ? 'left' : k > n ? 'right' : 'center';
    el.toggleAttribute('inert', k !== n);
  });
  focusWindow(topmost());
}

// ------------------------------------------------------------- open/close

export function open(id: string, { from }: { from?: HTMLElement } = {}) {
  const def = APPS[id];
  if (!def) return;
  const el = win(id);
  const existing = state.get(id);

  if (existing) {
    if (existing.ws !== 0 && existing.ws !== current) switchTo(existing.ws);
    if (existing.min) restoreWindow(id);
    else focusWindow(id, true);
    return;
  }

  const s: WinState = { ws: def.sticky ? 0 : current, min: false, restore: null, max: false };
  state.set(id, s);
  (def.sticky ? $('#float-layer') : wsEl(current)).append(el);
  // Embedded players load only when opened, and unload when closed.
  el.querySelectorAll<HTMLIFrameElement>('iframe[data-src]').forEach((f) => (f.src = f.dataset.src!));
  el.hidden = false;
  if (isCompact()) el.removeAttribute('style');
  else setRect(el, defaultRect(id));
  focusWindow(id, true);
  emit(id, 'win:open');

  if (!reducedMotion.matches) {
    // Grow out of the icon that launched it, if there was one.
    let start = 'scale(0.94)';
    if (from) {
      const a = from.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      start = `translate(${dx}px, ${dy}px) scale(0.12)`;
    }
    el.animate([{ transform: start, opacity: 0 }, { transform: 'none', opacity: 1 }], {
      duration: 280,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  }
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
}

export function close(id: string) {
  if (!state.has(id)) return;
  state.delete(id);
  const el = win(id);
  emit(id, 'win:close');
  const finish = () => {
    el.hidden = true;
    el.classList.remove('is-focused', 'is-max');
    el.removeAttribute('style');
    el.querySelectorAll<HTMLIFrameElement>('iframe[data-src]').forEach((f) => f.removeAttribute('src'));
    $('#win-pool').append(el);
  };
  if (reducedMotion.matches) finish();
  else {
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], {
      duration: 160,
      easing: 'ease-in',
    }).onfinish = finish;
  }
  if (focused === id) focusWindow(topmost(), true);
  else renderTaskbar();
  if (location.hash === `#${id}`) history.replaceState(null, '', location.pathname + location.search);
}

function taskButton(id: string) {
  return document.querySelector<HTMLElement>(`.task[data-task="${id}"]`);
}

export function minimize(id: string) {
  const s = state.get(id);
  if (!s || s.min) return;
  const el = win(id);
  const target = taskButton(id)?.getBoundingClientRect();
  s.min = true;
  emit(id, 'win:minimize');
  const finish = () => el.classList.add('is-min');
  if (reducedMotion.matches || !target) finish();
  else {
    const b = el.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (b.left + b.width / 2);
    const dy = target.top + target.height / 2 - (b.top + b.height / 2);
    el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0 }], {
      duration: 240,
      easing: 'cubic-bezier(0.4, 0, 0.8, 0.6)',
    }).onfinish = finish;
  }
  focusWindow(focused === id ? topmost() : focused);
}

function restoreWindow(id: string) {
  const s = state.get(id)!;
  const el = win(id);
  s.min = false;
  el.classList.remove('is-min');
  focusWindow(id, true);
  emit(id, 'win:restore');
  const target = taskButton(id)?.getBoundingClientRect();
  if (!reducedMotion.matches && target) {
    const b = el.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (b.left + b.width / 2);
    const dy = target.top + target.height / 2 - (b.top + b.height / 2);
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0 }, { transform: 'none', opacity: 1 }], {
      duration: 260,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  }
}

export function toggleMaximize(id: string) {
  const s = state.get(id);
  if (!s || isCompact()) return;
  const el = win(id);
  if (s.max) {
    s.max = false;
    el.classList.remove('is-max');
    glideTo(el, s.restore ?? defaultRect(id));
    s.restore = null;
  } else {
    if (!s.restore) s.restore = getRect(el);
    s.max = true;
    el.classList.add('is-max');
    glideTo(el, workArea());
  }
  focusWindow(id);
}

/** Lay out every visible window on this workspace, master on the left, the rest stacked on the right. */
export function tileWindows() {
  if (isCompact()) return;
  const ids = [...state.entries()].filter(([, s]) => s.ws === current && !s.min).map(([id]) => id);
  if (!ids.length) return;
  // The focused window takes the master slot.
  ids.sort((a, b) => Number(b === focused) - Number(a === focused));
  const a = workArea();
  const rects: Rect[] = [];
  if (ids.length === 1) rects.push(a);
  else {
    const masterW = Math.round((a.w - GAP) * 0.58);
    rects.push({ x: a.x, y: a.y, w: masterW, h: a.h });
    const rest = ids.length - 1;
    const h = (a.h - GAP * (rest - 1)) / rest;
    for (let i = 0; i < rest; i++) rects.push({ x: a.x + masterW + GAP, y: a.y + i * (h + GAP), w: a.w - masterW - GAP, h });
  }
  ids.forEach((id, i) => {
    const s = state.get(id)!;
    const el = win(id);
    if (!s.restore) s.restore = getRect(el);
    s.max = false;
    el.classList.remove('is-max');
    glideTo(el, rects[i]);
  });
}

/** Bring a window to the current workspace, the way i3 opens a terminal wherever you are. */
export function summon(id: string) {
  const s = state.get(id);
  if (!s) return open(id);
  if (s.ws !== 0 && s.ws !== current) {
    s.ws = current;
    wsEl(current).append(win(id));
  }
  if (s.min) restoreWindow(id);
  else focusWindow(id, true);
}

// -------------------------------------------------------- drag, snap, resize

function setupPointer() {
  const preview = $('#snap-preview');

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isCompact()) return;
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('.win');
    if (!el) return;
    const id = el.dataset.app!;
    if (focused !== id) focusWindow(id);

    const handle = t.closest<HTMLElement>('[data-rz]');
    const bar = t.closest<HTMLElement>('.win-bar');
    if (handle) startResize(e, el, handle.dataset.rz!);
    else if (bar && !t.closest('button')) startDrag(e, el, bar);
  });

  function startDrag(e: PointerEvent, el: HTMLElement, bar: HTMLElement) {
    const s = state.get(el.dataset.app!)!;
    let r = getRect(el);
    let grabX = e.clientX - r.x;
    const grabY = e.clientY - r.y;
    let moved = false;
    let snap: 'left' | 'right' | 'top' | null = null;
    bar.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');

    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      if (!moved && (s.max || s.restore)) {
        // Pulling a maximised or snapped window off the edge puts it back to its old size under the cursor.
        const back = s.restore ?? r;
        grabX = Math.min(grabX, back.w - 60) * (back.w / Math.max(r.w, 1)) || grabX;
        grabX = Math.min(Math.max(grabX, 40), back.w - 60);
        r = { ...back, x: ev.clientX - grabX, y: ev.clientY - grabY };
        s.max = false;
        s.restore = null;
        el.classList.remove('is-max');
      }
      moved = true;
      r = clampToScreen({ ...r, x: ev.clientX - grabX, y: ev.clientY - grabY });
      setRect(el, r);

      const edge = 6;
      snap = ev.clientX <= edge ? 'left' : ev.clientX >= window.innerWidth - edge ? 'right' : ev.clientY <= barBottom() + 2 ? 'top' : null;
      if (snap) {
        const a = workArea();
        const half = (a.w - GAP) / 2;
        const target = snap === 'top' ? a : { x: snap === 'left' ? a.x : a.x + half + GAP, y: a.y, w: half, h: a.h };
        setRect(preview, target);
        preview.hidden = false;
      } else preview.hidden = true;
    };

    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      el.classList.remove('is-dragging');
      preview.hidden = true;
      if (!snap) return;
      const id = el.dataset.app!;
      if (snap === 'top') {
        s.restore = r;
        s.max = false;
        toggleMaximize(id);
      } else {
        s.restore = r;
        glideTo(el, getRect(preview));
      }
    };

    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  }

  function startResize(e: PointerEvent, el: HTMLElement, dir: string) {
    e.preventDefault();
    const def = APPS[el.dataset.app!];
    const s = state.get(el.dataset.app!)!;
    const start = getRect(el);
    const minW = def.minW ?? MIN_W;
    const minH = def.minH ?? MIN_H;
    const top = barBottom() + 4;
    const handle = e.target as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    el.classList.add('is-resizing');
    s.max = false;
    s.restore = null;
    el.classList.remove('is-max');

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - e.clientX;
      const dy = ev.clientY - e.clientY;
      const r = { ...start };
      if (dir.includes('e')) r.w = Math.max(minW, start.w + dx);
      if (dir.includes('s')) r.h = Math.max(minH, start.h + dy);
      if (dir.includes('w')) {
        r.w = Math.max(minW, start.w - dx);
        r.x = start.x + start.w - r.w;
      }
      if (dir.includes('n')) {
        const y = Math.max(top, start.y + dy);
        r.h = Math.max(minH, start.y + start.h - y);
        r.y = start.y + start.h - r.h;
      }
      setRect(el, r);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      el.classList.remove('is-resizing');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  // Double-click a title bar to maximise, like every desktop since the nineties.
  document.addEventListener('dblclick', (e) => {
    const t = e.target as HTMLElement;
    const bar = t.closest<HTMLElement>('.win-bar');
    if (bar && !t.closest('button')) toggleMaximize(bar.closest<HTMLElement>('.win')!.dataset.app!);
  });
}

// ---------------------------------------------------------------- launcher

function setupLauncher() {
  const scrim = $('#launcher');
  const input = $<HTMLInputElement>('#launcher-input');
  const options = $$('[data-launch]', scrim);
  let active = 0;
  let returnTo: HTMLElement | null = null;

  const visible = () => options.filter((o) => !o.hidden);

  function highlight(i: number) {
    const list = visible();
    options.forEach((o) => o.setAttribute('aria-selected', 'false'));
    if (!list.length) return input.removeAttribute('aria-activedescendant');
    active = (i + list.length) % list.length;
    list[active].setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', list[active].id);
    list[active].scrollIntoView({ block: 'nearest' });
  }

  function filter() {
    const q = input.value.trim().toLowerCase();
    options.forEach((o) => (o.hidden = !!q && !o.dataset.terms!.includes(q)));
    $('#launcher-empty').hidden = visible().length > 0;
    highlight(0);
  }

  function show() {
    returnTo = document.activeElement as HTMLElement;
    scrim.hidden = false;
    input.value = '';
    filter();
    input.focus();
  }

  function hide() {
    scrim.hidden = true;
    returnTo?.focus?.();
  }

  function launch(o: HTMLElement) {
    scrim.hidden = true;
    const id = o.dataset.launch!;
    if (id === 'lock') lock();
    else if (id === 'tile') tileWindows();
    else if (id === 'terminal') summon('terminal');
    else open(id);
  }

  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = visible()[active]; if (o) launch(o); }
    else if (e.key === 'Escape') { e.preventDefault(); hide(); }
  });
  options.forEach((o) => o.addEventListener('click', () => launch(o)));
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) hide(); });

  return { show, isOpen: () => !scrim.hidden };
}

// -------------------------------------------------------------- lock screen

const LOCK_KEY = 'bigsky-unlocked';
let lockEl: HTMLElement;

function remember(value: boolean) {
  try {
    if (value) sessionStorage.setItem(LOCK_KEY, '1');
    else sessionStorage.removeItem(LOCK_KEY);
  } catch {
    // Without storage the lock screen just shows once per page load.
  }
}

function wasUnlocked() {
  try {
    return sessionStorage.getItem(LOCK_KEY) === '1';
  } catch {
    return false;
  }
}

const isLocked = () => !lockEl.hidden && !lockEl.classList.contains('is-gone');

function setInert(value: boolean) {
  for (const sel of ['#workspaces', '#bar', '#desktop', '#float-layer']) $(sel).toggleAttribute('inert', value);
}

export function lock() {
  lockEl.classList.remove('is-unlocking', 'is-gone');
  lockEl.hidden = false;
  setInert(true);
  remember(false);
  $('#lock-go').focus();
}

function unlock() {
  if (lockEl.classList.contains('is-unlocking')) return;
  lockEl.classList.add('is-unlocking');
  remember(true);
  const fast = reducedMotion.matches;
  window.setTimeout(() => {
    lockEl.classList.add('is-gone');
    setInert(false);
    focusWindow(topmost(), true);
    window.setTimeout(() => (lockEl.hidden = true), fast ? 0 : 500);
  }, fast ? 0 : 480);
}

function setupLock(skip: boolean) {
  lockEl = $('#lock');
  if (skip || wasUnlocked()) {
    lockEl.hidden = true;
    lockEl.classList.add('is-gone');
    return;
  }
  setInert(true);
  lockEl.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('a')) unlock();
  });
  // Like i3lock, every key lights a random slice of the ring. Any key gets you in.
  document.addEventListener('keydown', (e) => {
    if (!isLocked() || e.key === 'Tab' || e.key === 'Shift') return;
    const key = $('.ring-key', lockEl);
    key.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
    key.classList.remove('is-flash');
    void key.getBoundingClientRect();
    key.classList.add('is-flash');
    unlock();
  });
  $('#lock-go').focus();
}

// ------------------------------------------------------------------- setup

export function setupWindowManager() {
  const launcher = setupLauncher();
  setupPointer();

  const hashApp = location.hash.slice(1);
  setupLock(hashApp in APPS);

  $$('.ws').forEach((el) => {
    const k = Number(el.dataset.ws);
    el.dataset.pos = k === 1 ? 'center' : 'right';
    el.toggleAttribute('inert', k !== 1);
  });

  // The terminal, running neofetch, is the first thing on the desk.
  if (!isCompact()) open('terminal');
  if (hashApp in APPS && hashApp !== 'terminal') open(hashApp);
  renderTaskbar();

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const ctl = t.closest<HTMLElement>('[data-win]');
    if (ctl) {
      const id = ctl.closest<HTMLElement>('.win')!.dataset.app!;
      const action = ctl.dataset.win;
      if (action === 'close') close(id);
      else if (action === 'min') minimize(id);
      else if (action === 'max') toggleMaximize(id);
      return;
    }
    const task = t.closest<HTMLElement>('[data-task]');
    if (task) return onTaskClick(task.dataset.task!);
    const opener = t.closest<HTMLElement>('[data-open]');
    if (opener) {
      e.preventDefault();
      return open(opener.dataset.open!);
    }
    const wsBtn = t.closest<HTMLElement>('[data-ws-btn]');
    if (wsBtn) return switchTo(Number(wsBtn.dataset.wsBtn));
  });

  document.addEventListener('focusin', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.win');
    if (el && focused !== el.dataset.app) focusWindow(el.dataset.app!);
  });

  $('#bar-launch').addEventListener('click', () => launcher.show());
  $('#bar-tile').addEventListener('click', () => tileWindows());
  $('#bar-lock').addEventListener('click', () => lock());
  $('#bar-sun').addEventListener('click', () => $('#sky-scrub').focus());

  document.addEventListener('keydown', (e) => {
    if (isLocked()) return;
    const t = e.target as HTMLElement;
    const typing = t.matches('input, textarea, [contenteditable="true"]');

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const digit = /^Digit([1-4])$/.exec(e.code);
      if (digit) {
        e.preventDefault();
        switchTo(Number(digit[1]));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        summon('terminal');
        return;
      }
      if (e.shiftKey && e.code === 'KeyQ' && focused) {
        e.preventDefault();
        close(focused);
        return;
      }
    }
    if (e.key === '/' && !typing && !launcher.isOpen()) {
      e.preventDefault();
      launcher.show();
    }
  });

  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      state.forEach((s, id) => {
        const el = win(id);
        if (isCompact()) return el.removeAttribute('style');
        if (s.max) return setRect(el, workArea());
        if (!el.style.left) return setRect(el, defaultRect(id));
        setRect(el, clampToScreen(getRect(el)));
      });
    });
  });
  compactMq.addEventListener('change', () => window.dispatchEvent(new Event('resize')));
}
