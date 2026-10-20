// A case study's live scene: the desktop's sky, theme and land for now in Billings, plus the bar's sun line and clock.
// Paint only. No weather request, no window manager, no cursors socket; the desktop's cached weather shows if it has one.
import { billingsDateAt, cachedWeather, formatShortDay, formatTime, nextSunLine } from './sky';
import { setupLand } from './land';
import { fitWallpaper, paintScene } from './scene';

const wallpaper = document.querySelector<SVGSVGElement>('#wallpaper')!;

/** Dev only: ?at=18:50 paints that time of day, to check the page under every sky. */
const at = import.meta.env.DEV ? /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('at') ?? '') : null;

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function refresh() {
  const now = new Date();
  paintScene(wallpaper, at ? billingsDateAt(Number(at[1]) * 60 + Number(at[2]), now) : now);
  setText('bar-sun-text', nextSunLine(now));
  setText('bar-clock', `${formatShortDay(now)}  ${formatTime(now)}`);
}

function showWeather() {
  const w = cachedWeather();
  const el = document.getElementById('bar-weather');
  if (!w || !el) return;
  el.textContent = `${w.temp}° ${w.label}`;
  el.hidden = false;
}

/**
 * The title bar sticks under the top bar. Stuck, article.css squares it off and has it cover the strip above it, so
 * text doesn't scroll by in slivers around the top bar. Checked on scroll, once a frame: an observer missed jumps to
 * an anchor and slow scrolls into the phone layout's lower sticky top.
 */
function setupStuckBar() {
  const win = document.querySelector<HTMLElement>('.page-win');
  const bar = win?.querySelector<HTMLElement>('.win-bar');
  if (!win || !bar) return;
  let raf = 0;
  const check = () => {
    raf = 0;
    win.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= parseFloat(getComputedStyle(bar).top) + 0.5);
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(check);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  check();
}

/** Sideways scrollers take a tab stop only while there's something to scroll. Without JS they always do. */
function setupScrollers() {
  const els = document.querySelectorAll<HTMLElement>('[data-scroller]');
  const update = () => els.forEach((el) => (el.tabIndex = el.scrollWidth > el.clientWidth ? 0 : -1));
  const ro = new ResizeObserver(update);
  els.forEach((el) => ro.observe(el));
  document.fonts.ready.then(update);
}

/** Figure loops play only while on screen. Under reduced motion they wait for the visitor to press play. */
function setupLoops() {
  const loops = document.querySelectorAll<HTMLVideoElement>('video[data-loop]');
  if (!loops.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    loops.forEach((v) => (v.controls = true));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }
  });
  loops.forEach((v) => io.observe(v));
}

const land = document.querySelector<HTMLCanvasElement>('#land')!;
setupLand(land, { stableHeight: true });
fitWallpaper(wallpaper);
refresh();
showWeather();
setupStuckBar();
setupScrollers();
setupLoops();

// Every 30s while the tab shows. A hidden tab stops, and catches up when it's back.
let timer = window.setInterval(refresh, 30000);
document.addEventListener('visibilitychange', () => {
  window.clearInterval(timer);
  if (document.hidden) return;
  refresh();
  timer = window.setInterval(refresh, 30000);
});
matchMedia('(max-width: 760px)').addEventListener('change', () => fitWallpaper(wallpaper));
// The sun's arc depends on how much sky shows. The scene is 100lvh tall, so a phone's URL bar showing and hiding
// leaves its box alone and the sun stays put; only a real resize repaints.
let box = `${land.clientWidth}x${land.clientHeight}`;
let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    const next = `${land.clientWidth}x${land.clientHeight}`;
    if (next === box) return;
    box = next;
    refresh();
  });
});
