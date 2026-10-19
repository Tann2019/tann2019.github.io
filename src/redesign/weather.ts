// Live weather over the scene: noise-generated clouds sized by real cloud cover and lit by the
// current sky, plus rain or snow when it's falling in Billings. Preview any condition with ?weather=.

type RGB = [number, number, number];

export interface WeatherNow {
  code: number;
  /** Cloud cover, 0-100. */
  cloud: number;
  /** mm per hour. */
  rain: number;
  /** cm per hour. */
  snow: number;
  /** km/h. */
  wind: number;
}

/** One drifting sheet of cloud: density and lighting are computed once, color on every sky change. */
interface CloudLayer {
  w: number;
  h: number;
  density: Float32Array;
  light: Float32Array;
  canvas: HTMLCanvasElement;
  /** Vertical band of the screen, as fractions of the viewport height. */
  top: number;
  bottom: number;
  /** How many screen widths one tile spans. */
  span: number;
  speed: number;
  opacity: number;
  offset: number;
}

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
  r: number;
  phase: number;
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0} / ${a})`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Conditions you can force with ?weather= to review the effects. */
const PRESETS: Record<string, WeatherNow> = {
  clear: { code: 0, cloud: 0, rain: 0, snow: 0, wind: 6 },
  cloudy: { code: 2, cloud: 55, rain: 0, snow: 0, wind: 14 },
  overcast: { code: 3, cloud: 100, rain: 0, snow: 0, wind: 10 },
  rain: { code: 63, cloud: 92, rain: 2.5, snow: 0, wind: 18 },
  snow: { code: 73, cloud: 92, rain: 0, snow: 1.2, wind: 8 },
  storm: { code: 95, cloud: 100, rain: 6, snow: 0, wind: 30 },
};

export function forcedWeather(): WeatherNow | null {
  const key = new URLSearchParams(location.search).get('weather');
  return key && key in PRESETS ? PRESETS[key] : null;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ cloud noise

/** Value noise that wraps every `period` cells in x, so a cloud tile scrolls without a seam. */
function makeNoise(seed: number) {
  const N = 256;
  const rand = seeded(seed);
  const table = Float32Array.from({ length: N * N }, () => rand());
  const wrap = (v: number, p: number) => ((v % p) + p) % p;
  return (x: number, y: number, period: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = wrap(xi, period) % N;
    const x1 = wrap(xi + 1, period) % N;
    const y0 = wrap(yi, N);
    const y1 = wrap(yi + 1, N);
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = table[y0 * N + x0] + (table[y0 * N + x1] - table[y0 * N + x0]) * u;
    const b = table[y1 * N + x0] + (table[y1 * N + x1] - table[y1 * N + x0]) * u;
    return a + (b - a) * v;
  };
}

function buildLayer(opts: {
  seed: number;
  w: number;
  h: number;
  cellsX: number;
  cellsY: number;
  coverage: number;
  softness: number;
  top: number;
  bottom: number;
  span: number;
  speed: number;
  opacity: number;
}): CloudLayer {
  const { w, h } = opts;
  const noise = makeNoise(opts.seed);
  const density = new Float32Array(w * h);
  // More cover means a lower threshold on the noise.
  const threshold = 0.66 - opts.coverage * 0.36;
  for (let y = 0; y < h; y++) {
    // Thin out toward the top and bottom of the band.
    const env = Math.pow(Math.sin((Math.PI * (y + 0.5)) / h), 0.7);
    for (let x = 0; x < w; x++) {
      let f = 0;
      let amp = 0.5;
      let fx = (x / w) * opts.cellsX;
      let fy = (y / h) * opts.cellsY;
      let period = opts.cellsX;
      for (let o = 0; o < 5; o++) {
        f += noise(fx, fy + o * 31, period) * amp;
        fx *= 2;
        fy *= 2;
        period *= 2;
        amp *= 0.5;
      }
      density[y * w + x] = clamp01((f * env - threshold) / opts.softness);
    }
  }
  // Light comes from above: a pixel with more cloud below it than above is on a sunlit top.
  const light = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const above = density[Math.max(0, y - 3) * w + x];
      const below = density[Math.min(h - 1, y + 3) * w + x];
      light[i] = clamp01(0.62 + (below - above) * 1.4 - density[i] * 0.3);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { w, h, density, light, canvas, top: opts.top, bottom: opts.bottom, span: opts.span, speed: opts.speed, opacity: opts.opacity, offset: 0 };
}

function tintLayer(layer: CloudLayer) {
  const g = layer.canvas.getContext('2d')!;
  const img = g.createImageData(layer.w, layer.h);
  const px = img.data;
  for (let i = 0; i < layer.density.length; i++) {
    const d = layer.density[i];
    if (d <= 0) continue;
    const t = layer.light[i];
    const o = i * 4;
    px[o] = shade[0] + (lit[0] - shade[0]) * t;
    px[o + 1] = shade[1] + (lit[1] - shade[1]) * t;
    px[o + 2] = shade[2] + (lit[2] - shade[2]) * t;
    px[o + 3] = 255 * Math.pow(d, 0.85) * layer.opacity;
  }
  g.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ state

let cloudCanvas: HTMLCanvasElement;
let precipCanvas: HTMLCanvasElement;
let cctx: CanvasRenderingContext2D;
let pctx: CanvasRenderingContext2D;
let width = 0;
let height = 0;
let weather: WeatherNow = PRESETS.clear;
let layers: CloudLayer[] = [];
let drops: Drop[] = [];
let lit: RGB = [255, 255, 255];
let shade: RGB = [180, 190, 205];
let veil: RGB = [200, 205, 215];
let raf = 0;
let lastFrame = 0;

function size(el: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.width = Math.round(width * dpr);
  el.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeClouds() {
  const cover = clamp01(weather.cloud / 100);
  layers = [];
  if (cover < 0.04) return;
  const wind = 0.5 + weather.wind / 20;
  // High, wispy sheet: stretched wide, thin, slow.
  layers.push(
    buildLayer({ seed: 11, w: 384, h: 96, cellsX: 4, cellsY: 3, coverage: cover * 0.7, softness: 0.3, top: 0.03, bottom: 0.24, span: 2.2, speed: 2.5 * wind, opacity: 0.55 }),
  );
  // The main layer: puffier, lower, a touch faster so the two drift apart.
  layers.push(
    buildLayer({ seed: 29, w: 448, h: 150, cellsX: 7, cellsY: 3.2, coverage: cover, softness: 0.22, top: 0.08, bottom: 0.46, span: 1.8, speed: 5 * wind, opacity: 0.95 }),
  );
  layers.forEach(tintLayer);
}

function makeDrops() {
  const rand = seeded(9);
  const snowing = weather.snow > 0;
  const count = snowing
    ? Math.round(Math.min(320, 90 + weather.snow * 160))
    : weather.rain > 0
      ? Math.round(Math.min(420, 70 + weather.rain * 70))
      : 0;
  const scale = width < 760 ? 0.5 : 1;
  drops = Array.from({ length: Math.round(count * scale) }, () => ({
    x: rand() * width,
    y: rand() * height,
    v: snowing ? 30 + rand() * 45 : 650 + rand() * 300,
    len: snowing ? 0 : 10 + rand() * 9,
    r: snowing ? 1 + rand() * 1.6 : 0,
    phase: rand() * Math.PI * 2,
  }));
}

function drawClouds() {
  cctx.clearRect(0, 0, width, height);
  // Overcast skies get a veil that flattens the color, heavier the more cloud there is.
  const over = clamp01((weather.cloud - 60) / 40);
  if (over > 0) {
    const g = cctx.createLinearGradient(0, 0, 0, height * 0.75);
    g.addColorStop(0, css(veil, 0.5 * over));
    g.addColorStop(1, css(veil, 0.2 * over));
    cctx.fillStyle = g;
    cctx.fillRect(0, 0, width, height);
  }
  cctx.imageSmoothingEnabled = true;
  cctx.imageSmoothingQuality = 'high';
  for (const layer of layers) {
    const tileW = width * layer.span;
    const y = height * layer.top;
    const h = height * (layer.bottom - layer.top);
    const x = -(layer.offset % tileW);
    // Two copies side by side; the noise wraps, so the seam is invisible.
    cctx.drawImage(layer.canvas, x, y, tileW, h);
    cctx.drawImage(layer.canvas, x + tileW, y, tileW, h);
  }
}

function drawPrecip(t: number) {
  pctx.clearRect(0, 0, width, height);
  if (!drops.length) return;
  const snowing = weather.snow > 0;
  const slant = Math.min(0.5, weather.wind / 60);
  if (snowing) {
    pctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    pctx.beginPath();
    for (const d of drops) {
      const x = d.x + Math.sin(t / 1300 + d.phase) * 10;
      pctx.moveTo(x + d.r, d.y);
      pctx.arc(x, d.y, d.r, 0, Math.PI * 2);
    }
    pctx.fill();
  } else {
    pctx.strokeStyle = 'rgb(210 225 245 / 0.32)';
    pctx.lineWidth = 1;
    pctx.beginPath();
    for (const d of drops) {
      pctx.moveTo(d.x, d.y);
      pctx.lineTo(d.x - d.len * slant, d.y + d.len);
    }
    pctx.stroke();
  }
}

function step(now: number) {
  raf = 0;
  const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  for (const layer of layers) layer.offset += layer.speed * dt;
  const slant = Math.min(0.5, weather.wind / 60);
  for (const d of drops) {
    d.y += d.v * dt;
    d.x -= d.v * dt * slant * (d.len ? 1 : 0.2);
    if (d.y > height) {
      d.y = -20;
      d.x = Math.random() * (width + 100);
    }
    if (d.x < -40) d.x = width + 20;
  }
  drawClouds();
  drawPrecip(now);
  schedule();
}

function schedule() {
  if (raf || document.hidden || reducedMotion.matches) return;
  if (!layers.length && !drops.length) return;
  // About 30 fps is plenty for weather.
  raf = requestAnimationFrame((t) => {
    if (t - lastFrame < 30) {
      raf = 0;
      schedule();
      return;
    }
    step(t);
  });
}

function redraw() {
  drawClouds();
  drawPrecip(performance.now());
  schedule();
}

export interface SkyLight {
  alt: number;
  top: string;
  horizon: string;
}

let tintRaf = 0;

/** Recolor clouds for the current sky. Called whenever the sky repaints. */
export function lightWeather(sky: SkyLight) {
  const top = hex(sky.top);
  const horizon = hex(sky.horizon);
  const day = clamp01((sky.alt + 4) / 24);
  const dark = clamp01((-sky.alt - 2) / 9);
  const golden = clamp01(1 - Math.abs(sky.alt - 2) / 8);
  lit = mix(mix(horizon, [255, 255, 255], 0.4 + 0.5 * day), [255, 190, 140], 0.45 * golden);
  lit = mix(lit, mix(top, [150, 160, 190], 0.35), 0.75 * dark);
  shade = mix(mix(top, [128, 134, 150], 0.5), [24, 28, 40], 0.6 * dark);
  shade = mix(shade, [150, 110, 140], 0.25 * golden);
  veil = mix(mix([205, 210, 218], horizon, 0.3), [24, 28, 40], 0.8 * dark);
  if (!cctx) return;
  // Scrubbing fires this many times a second; tint at most once per frame.
  cancelAnimationFrame(tintRaf);
  tintRaf = requestAnimationFrame(() => {
    layers.forEach(tintLayer);
    redraw();
  });
}

export function setWeather(w: WeatherNow) {
  weather = w;
  makeClouds();
  makeDrops();
  redraw();
}

export function setupWeather(clouds: HTMLCanvasElement, precip: HTMLCanvasElement) {
  cloudCanvas = clouds;
  precipCanvas = precip;
  cctx = clouds.getContext('2d')!;
  pctx = precip.getContext('2d')!;
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    size(cloudCanvas, cctx);
    size(precipCanvas, pctx);
    makeDrops();
    redraw();
  };
  resize();
  let r = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(r);
    r = requestAnimationFrame(resize);
  });
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', redraw);
}
