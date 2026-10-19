// Desktop icons: drag them (alone or as a selection), rubber-band select, double-click to open.
// Positions snap to a grid and are remembered per visitor.
import { isCompact, open, unfocusAll } from './wm';

const CELL_W = 96;
const CELL_H = 104;
const EDGE = 16;
const STORE_KEY = 'bigsky-icons-v1';

interface Point {
  x: number;
  y: number;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

export function setupDesktop() {
  const desk = $('#desktop');
  const marquee = $('#marquee');
  const icons = Array.from(desk.querySelectorAll<HTMLElement>('.dicon'));
  const pos = new Map<HTMLElement, Point>();
  const selected = new Set<HTMLElement>();
  let lastTap: { icon: HTMLElement | null; at: number } = { icon: null, at: 0 };

  const top = () => $('#bar').getBoundingClientRect().bottom + 10;
  const rows = () => Math.max(1, Math.floor((window.innerHeight - top() - EDGE) / CELL_H));
  const cols = () => Math.max(1, Math.floor((window.innerWidth - EDGE * 2) / CELL_W));
  /** Columns count from the right edge, the way the icons start out. */
  const cellToPoint = (c: number, r: number): Point => ({
    x: window.innerWidth - EDGE - (c + 1) * CELL_W,
    y: top() + r * CELL_H,
  });
  const pointToCell = (p: Point) => ({
    c: Math.min(cols() - 1, Math.max(0, Math.round((window.innerWidth - EDGE - CELL_W - p.x) / CELL_W))),
    r: Math.min(rows() - 1, Math.max(0, Math.round((p.y - top()) / CELL_H))),
  });
  const key = (c: number, r: number) => `${c},${r}`;

  function place(el: HTMLElement, p: Point) {
    pos.set(el, p);
    el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  }

  function save() {
    const out: Record<string, { c: number; r: number }> = {};
    icons.forEach((el) => (out[el.dataset.app!] = pointToCell(pos.get(el)!)));
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(out));
    } catch {
      // Positions just won't survive a reload.
    }
  }

  function loadSaved(): Record<string, { c: number; r: number }> | null {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  /** Find the nearest free cell to (c, r), spiralling outwards. */
  function nearestFree(c: number, r: number, taken: Set<string>) {
    const maxC = cols();
    const maxR = rows();
    for (let d = 0; d < Math.max(maxC, maxR); d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (let dr = -d; dr <= d; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= maxC || rr >= maxR) continue;
          if (!taken.has(key(cc, rr))) return { c: cc, r: rr };
        }
      }
    }
    return { c, r };
  }

  function arrange() {
    if (isCompact()) {
      icons.forEach((el) => el.style.removeProperty('transform'));
      return;
    }
    const saved = loadSaved();
    const taken = new Set<string>();
    icons.forEach((el, i) => {
      const want = saved?.[el.dataset.app!] ?? { c: Math.floor(i / rows()), r: i % rows() };
      const cell = nearestFree(Math.min(want.c, cols() - 1), Math.min(want.r, rows() - 1), taken);
      taken.add(key(cell.c, cell.r));
      place(el, cellToPoint(cell.c, cell.r));
    });
  }

  function select(els: Iterable<HTMLElement>) {
    selected.clear();
    for (const el of els) selected.add(el);
    icons.forEach((el) => el.classList.toggle('is-selected', selected.has(el)));
  }

  // ------------------------------------------------------- icon dragging

  desk.addEventListener('pointerdown', (e) => {
    const icon = (e.target as HTMLElement).closest<HTMLElement>('.dicon');
    if (!icon || e.button !== 0) return;
    unfocusAll();
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      if (selected.has(icon)) selected.delete(icon);
      else selected.add(icon);
      select([...selected]);
      return;
    }
    if (!selected.has(icon)) select([icon]);
    if (isCompact()) return;

    const start = { x: e.clientX, y: e.clientY };
    const group = [...selected];
    const origin = new Map(group.map((el) => [el, { ...pos.get(el)! }]));
    let dragging = false;
    icon.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) < 5) return;
      if (!dragging) {
        dragging = true;
        group.forEach((el) => el.classList.add('is-dragging'));
      }
      group.forEach((el) => {
        const o = origin.get(el)!;
        place(el, { x: o.x + dx, y: o.y + dy });
      });
    };

    const up = (ev: PointerEvent) => {
      icon.removeEventListener('pointermove', move);
      icon.removeEventListener('pointerup', up);
      icon.removeEventListener('pointercancel', up);
      if (!dragging) {
        // Our own double-click: pointer capture can swallow the native dblclick.
        const now = performance.now();
        if (ev.type === 'pointerup' && (ev.pointerType === 'touch' || (lastTap.icon === icon && now - lastTap.at < 450))) {
          lastTap = { icon: null, at: 0 };
          open(icon.dataset.app!, { from: icon });
        } else lastTap = { icon, at: now };
        return;
      }
      group.forEach((el) => el.classList.remove('is-dragging'));
      // Snap to the grid. Icons that weren't moved keep their cells.
      const taken = new Set(icons.filter((el) => !group.includes(el)).map((el) => {
        const cell = pointToCell(pos.get(el)!);
        return key(cell.c, cell.r);
      }));
      group.forEach((el) => {
        const want = pointToCell(pos.get(el)!);
        const cell = nearestFree(want.c, want.r, taken);
        taken.add(key(cell.c, cell.r));
        el.classList.add('is-settling');
        place(el, cellToPoint(cell.c, cell.r));
        window.setTimeout(() => el.classList.remove('is-settling'), 200);
      });
      save();
    };

    icon.addEventListener('pointermove', move);
    icon.addEventListener('pointerup', up);
    icon.addEventListener('pointercancel', up);
  });

  // Keyboard Enter (a click with detail 0) opens, and on phones a tap opens.
  desk.addEventListener('click', (e) => {
    const icon = (e.target as HTMLElement).closest<HTMLElement>('.dicon');
    if (icon && (e.detail === 0 || isCompact())) open(icon.dataset.app!, { from: icon });
  });

  // ------------------------------------------------------ rubber band

  desk.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || isCompact() || t.closest('.dicon, input, button, a, label')) return;
    unfocusAll();
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? new Set(selected) : new Set<HTMLElement>();
    if (!additive) select([]);
    const start = { x: e.clientX, y: e.clientY };
    const boxes = icons.map((el) => [el, el.getBoundingClientRect()] as const);
    desk.setPointerCapture(e.pointerId);
    e.preventDefault();

    const move = (ev: PointerEvent) => {
      const x = Math.min(start.x, ev.clientX);
      const y = Math.min(start.y, ev.clientY);
      const w = Math.abs(ev.clientX - start.x);
      const h = Math.abs(ev.clientY - start.y);
      if (w < 3 && h < 3) return;
      marquee.hidden = false;
      Object.assign(marquee.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      const hits = boxes.filter(([, b]) => b.left < x + w && b.right > x && b.top < y + h && b.bottom > y).map(([el]) => el);
      select(new Set([...base, ...hits]));
    };
    const up = () => {
      marquee.hidden = true;
      desk.removeEventListener('pointermove', move);
      desk.removeEventListener('pointerup', up);
      desk.removeEventListener('pointercancel', up);
    };
    desk.addEventListener('pointermove', move);
    desk.addEventListener('pointerup', up);
    desk.addEventListener('pointercancel', up);
  });

  // Keyboard: one tab stop for the whole desktop, arrow keys move to the nearest icon that way.
  icons.forEach((el, i) => (el.tabIndex = i === 0 ? 0 : -1));
  const center = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const DIRS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  desk.addEventListener('keydown', (e) => {
    const icon = (e.target as HTMLElement).closest<HTMLElement>('.dicon');
    const dir = DIRS[e.key];
    if (!icon || !dir) return;
    e.preventDefault();
    const from = center(icon);
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const other of icons) {
      if (other === icon) continue;
      const c = center(other);
      const dx = c.x - from.x;
      const dy = c.y - from.y;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 4) continue;
      const score = along + 2 * Math.abs(dx * dir[1] + dy * dir[0]);
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    if (best) {
      best.focus();
      select([best]);
    }
  });
  desk.addEventListener('focusin', (e) => {
    const icon = (e.target as HTMLElement).closest<HTMLElement>('.dicon');
    if (icon) icons.forEach((el) => (el.tabIndex = el === icon ? 0 : -1));
  });

  // Escape clears the selection when nothing else wants it.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected.size && !(e.target as HTMLElement).closest('.win, .launcher')) select([]);
  });

  arrange();
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(arrange);
  });
}
