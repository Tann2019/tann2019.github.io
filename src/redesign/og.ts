// One social share card: the homepage's own sky, land and clouds frozen at a set moment, with site UI on top.
// Loaded by src/pages/og-card/[...slug].astro (dev only). scripts/generate-og.mjs waits for window.__ogReady,
// then screenshots. Clouds hold still only under prefers-reduced-motion, which the generator emulates.
import { billingsDateAt, formatTime, paintSky } from './sky';
import { setupLand } from './land';
import { paintScene } from './scene';
import { lightWeather, setWeather, setupWeather } from './weather';

declare global {
  interface Window {
    __ogReady?: boolean;
    __ogError?: string;
  }
}

/** Every card is the same Billings day, so the sun, moon and stars land in the same place on every run. */
const REFERENCE_DAY = new Date('2026-10-19T12:00:00-06:00');

// At 1200×630 the homepage's 1600×1000 frame puts the horizon under the land, so anything below about 30°
// hides behind the ridges. A taller frame lifts the horizon to the ridgeline: a low sun clears the peaks.
const FRAME_W = 1600;
const FRAME_H = 1200;

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/** Shrink a heading until it fits in `data-max-lines` lines and its window doesn't overflow. */
function fit(el: HTMLElement) {
  const maxLines = Number(el.dataset.maxLines ?? 1);
  const min = Number(el.dataset.minSize ?? 40);
  const box = el.closest<HTMLElement>('.win-body') ?? el.parentElement!;
  let size = parseFloat(getComputedStyle(el).fontSize);
  const lines = () => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
  const overflows = () => lines() > maxLines || el.scrollWidth > el.clientWidth || box.scrollHeight > box.clientHeight;
  while (size > min && overflows()) {
    size -= 2;
    el.style.fontSize = `${size}px`;
  }
}

/** Pan the sky (not the land) so the sun, or the moon once the afterglow is gone, sits at `focusX` on screen. */
function panSky(svg: SVGSVGElement, date: Date, focusX: number) {
  svg.setAttribute('viewBox', `0 0 ${FRAME_W} ${FRAME_H}`);
  const { alt } = paintSky(svg, date);
  // paintSky draws a glow around the sun until it's 6° down.
  const body = svg.querySelector(alt > -6 ? '#sky-sun' : '#sky-moon')!;
  const x = Number(/translate\(([-\d.]+)/.exec(body.getAttribute('transform') ?? '')?.[1] ?? FRAME_W / 2);
  const scale = window.innerWidth / FRAME_W;
  svg.setAttribute('viewBox', `${(x - focusX / scale).toFixed(1)} 0 ${FRAME_W} ${FRAME_H}`);
}

function paint() {
  const { minutes, cloud, focus } = document.documentElement.dataset;
  const date = billingsDateAt(Number(minutes), REFERENCE_DAY);
  const svg = $<SVGSVGElement>('#wallpaper');

  setupLand($<HTMLCanvasElement>('#land'));
  setupWeather($<HTMLCanvasElement>('#clouds'), $<HTMLCanvasElement>('#precip'));
  setWeather({ code: Number(cloud) > 0 ? 2 : 0, cloud: Number(cloud), rain: 0, snow: 0, wind: 6 });

  panSky(svg, date, Number(focus));
  paintScene(svg, date, lightWeather);

  // Time only: a weekday here would compete with a post's own date.
  document.querySelectorAll('[data-og="clock"]').forEach((el) => (el.textContent = formatTime(date)));
}

async function main() {
  // Ask for the faces outright: fonts.ready alone can resolve before layout has requested them.
  if (document.readyState !== 'complete') await new Promise((resolve) => addEventListener('load', resolve, { once: true }));
  const faces = ['700 100px "National Park"', '400 34px Overpass', '600 22px Overpass', '700 22px Overpass'];
  await Promise.all(faces.map((f) => document.fonts.load(f))).catch((err) => {
    throw new Error(`Fonts did not load: ${err}`);
  });
  await document.fonts.ready;
  paint();
  document.querySelectorAll<HTMLElement>('[data-fit]').forEach(fit);
  // lightWeather tints the clouds on the next frame; give it two to land.
  await frame();
  await frame();
  window.__ogReady = true;
}

// The /og-card/ index has no scene to paint.
if (document.documentElement.dataset.minutes) {
  main().catch((err) => {
    window.__ogError = String(err?.stack ?? err);
  });
}
