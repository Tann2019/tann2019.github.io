// Layered mountain ridges under the live sky. Every color is derived from the sky at paint time:
// far ridges melt into the horizon haze, near ridges darken toward silhouette, mist sits in the valleys.

type RGB = [number, number, number];

interface Layer {
  /** Ridge height in CSS px for each sample column. */
  ys: Float32Array;
  base: number;
  depth: number;
}

const LAYERS = 6;
/** Horizontal resolution: one sample every few CSS px is plenty for silhouettes. */
const STEP = 3;

// ------------------------------------------------------------------- noise

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** 1D gradient noise in [-1, 1], smooth and repeatable for a given seed. */
function noise1d(seed: number) {
  const rand = seeded(seed);
  const grads = Float32Array.from({ length: 512 }, () => rand() * 2 - 1);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const g0 = grads[i & 511];
    const g1 = grads[(i + 1) & 511];
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    return (g0 * f + (g1 * (f - 1) - g0 * f) * u) * 2;
  };
}

function fractal(n: (x: number) => number, x: number, octaves: number, ridged: boolean) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const v = n(x * freq);
    sum += (ridged ? 1 - Math.abs(v) : v * 0.5 + 0.5) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// ------------------------------------------------------------------ colors

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const css = (c: RGB, a = 1) => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0} / ${a})`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Mixing in OKLab keeps orange-to-violet transitions clean; plain RGB mixing turns them to mud.
const toLinear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => 255 * clamp01(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklab([r, g, b]: RGB): RGB {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const A = oklab(a);
  const B = oklab(b);
  return fromOklab([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

// --------------------------------------------------------------- the scene

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let layers: Layer[] = [];
let trees: { x: number; y: number; h: number; layer: number }[] = [];
let cabins: { x: number; y: number }[] = [];
let width = 0;
let height = 0;
let snowLine = 0;

/** Rebuild ridge geometry for the current viewport. Positions are in CSS px. */
function build() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const compact = width < 760;
  // Ridges scale with height so the range keeps its shape on any screen.
  const unit = height / 1000;
  const cols = Math.ceil(width / STEP) + 2;
  // Noise is sampled in a fixed virtual space so the skyline doesn't reshuffle on resize.
  const virtual = (px: number) => px / (unit * 1000);

  layers = [];
  // A slow swell across the range, so some massifs stand taller than others.
  const envelope = noise1d(4242);
  for (let i = 0; i < LAYERS; i++) {
    const t = i / (LAYERS - 1);
    const n = noise1d(1882 + i * 97);
    const base = height * (compact ? 0.6 : 0.56) + t * height * (compact ? 0.3 : 0.34);
    const amp = (compact ? 230 : 250) * unit * (1 - t * 0.72);
    const freq = 1.3 + t * 2.4;
    const ridged = i < 2;
    const ys = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      const x = virtual(c * STEP) * freq + i * 3.7;
      const h = fractal(n, x, i < 2 ? 6 : 5, ridged);
      // Far ranges get bold peaks; near ones roll.
      const shaped = ridged ? Math.pow(h, 1.6) : h;
      const swell = ridged ? 0.62 + 0.5 * (envelope(virtual(c * STEP) * 0.9 + i) * 0.5 + 0.5) : 1;
      ys[c] = base - shaped * amp * swell;
    }
    layers.push({ ys, base, depth: t });
  }
  snowLine = layers[0].base - 250 * unit * 0.62;

  // Conifers along the two nearest ridges, thinned by noise so there are clearings.
  trees = [];
  const rand = seeded(7);
  for (const li of [LAYERS - 2, LAYERS - 1]) {
    const layer = layers[li];
    const near = li === LAYERS - 1;
    const clearing = noise1d(311 + li);
    const spacing = (near ? 7 : 4.5) * Math.max(unit, 0.6);
    for (let x = -10; x < width + 10; x += spacing * (0.6 + rand() * 0.8)) {
      if (clearing(virtual(x) * 6) < -0.25) continue;
      const c = Math.max(0, Math.min(layer.ys.length - 1, Math.round(x / STEP)));
      const h = (near ? 34 : 18) * Math.max(unit, 0.6) * (0.55 + rand() * 0.6);
      trees.push({ x, y: layer.ys[c] + 2, h, layer: li });
    }
  }

  // A handful of cabin lights in the near hills for night.
  cabins = [];
  for (let k = 0; k < 9; k++) {
    const li = LAYERS - 2 + (k % 2);
    const layer = layers[li];
    const x = width * (0.08 + rand() * 0.84);
    const c = Math.round(x / STEP);
    const top = layer.ys[c] ?? layer.base;
    cabins.push({ x, y: top + (layer.base - top) * (0.35 + rand() * 0.5) + 6 });
  }
}

function ridgePath(layer: Layer) {
  ctx.beginPath();
  ctx.moveTo(-STEP, height + 2);
  for (let c = 0; c < layer.ys.length; c++) ctx.lineTo(c * STEP - STEP, layer.ys[c]);
  ctx.lineTo(width + STEP, height + 2);
  ctx.closePath();
}

function drawTree(x: number, y: number, h: number) {
  const w = h * 0.36;
  // Three tiers, each a little wider: reads as a spruce at any size.
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w * 0.42, y - h * 0.62);
  ctx.lineTo(x + w * 0.24, y - h * 0.62);
  ctx.lineTo(x + w * 0.72, y - h * 0.28);
  ctx.lineTo(x + w * 0.4, y - h * 0.28);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x - w, y);
  ctx.lineTo(x - w * 0.4, y - h * 0.28);
  ctx.lineTo(x - w * 0.72, y - h * 0.28);
  ctx.lineTo(x - w * 0.24, y - h * 0.62);
  ctx.lineTo(x - w * 0.42, y - h * 0.62);
  ctx.closePath();
}

export interface LandLight {
  /** Sun altitude in degrees. */
  alt: number;
  /** Sky colors as displayed, from sky.ts. */
  top: string;
  mid: string;
  horizon: string;
}

let last: LandLight | null = null;

export function paintLand(light: LandLight) {
  last = light;
  if (!ctx) return;
  const horizon = hex(light.horizon);
  const top = hex(light.top);
  const mid = hex(light.mid);
  const day = clamp01((light.alt + 4) / 24);
  const dark = clamp01((-light.alt - 2) / 9);

  const golden = clamp01(1 - Math.abs(light.alt - 2) / 9);
  // Distant haze is bluer by day (the sky a little above the horizon), pale peach at sunset.
  const haze = mix(mix(horizon, mid, 0.1 + 0.45 * day), [255, 214, 192], 0.3 * golden);
  // Near ridges: deep blue-green by day, ink at night, indigo at golden hour.
  const nearDay: RGB = [30, 46, 50];
  const nearNight: RGB = [8, 12, 24];
  const near = mix(mix(mix(nearNight, nearDay, day), top, 0.16 + 0.14 * (1 - day)), [46, 38, 88], 0.5 * golden);
  const far = mix(haze, near, 0.16 + 0.28 * dark);

  ctx.clearRect(0, 0, width, height);

  layers.forEach((layer, i) => {
    const t = layer.depth;
    const color = mix(far, near, Math.pow(t, 0.8));
    const lit = mix(color, haze, 0.14 * (1 - t));
    const minY = layer.base - 260;
    const grad = ctx.createLinearGradient(0, minY, 0, layer.base + 40);
    grad.addColorStop(0, css(lit));
    grad.addColorStop(1, css(color));
    ridgePath(layer);
    ctx.fillStyle = grad;
    ctx.fill();

    // Snow on the high peaks of the far range, catching whatever light the sky has.
    if (i < 2) {
      const snow = mix(color, mix(haze, [250, 252, 255], 0.7), 0.2 + 0.45 * day - 0.12 * dark);
      ctx.save();
      ridgePath(layer);
      ctx.clip();
      const sg = ctx.createLinearGradient(0, snowLine - 120, 0, snowLine + 30);
      sg.addColorStop(0, css(snow, 0.95));
      sg.addColorStop(1, css(snow, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(0, snowLine - 200, width, 240);
      ctx.restore();
    }

    if (i >= LAYERS - 2) {
      ctx.beginPath();
      for (const tr of trees) if (tr.layer === i) drawTree(tr.x, tr.y, tr.h);
      ctx.fillStyle = css(color);
      ctx.fill();
    }

    // Valley mist between this ridge and the next one in front.
    if (i < LAYERS - 1) {
      const next = layers[i + 1];
      const mistTop = Math.min(layer.base, next.base) - 70;
      const mg = ctx.createLinearGradient(0, mistTop, 0, next.base);
      const mistColor = mix(haze, [255, 255, 255], 0.08 * day);
      mg.addColorStop(0, css(mistColor, 0));
      mg.addColorStop(1, css(mistColor, 0.22 + 0.12 * day - 0.12 * dark));
      ctx.fillStyle = mg;
      ctx.fillRect(0, mistTop, width, next.base - mistTop);
    }
  });

  if (dark > 0.05) {
    for (const c of cabins) {
      const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 7);
      glow.addColorStop(0, `rgb(255 200 120 / ${0.9 * dark})`);
      glow.addColorStop(1, 'rgb(255 180 100 / 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(c.x - 7, c.y - 7, 14, 14);
    }
  }
}

export function setupLand(el: HTMLCanvasElement) {
  canvas = el;
  ctx = el.getContext('2d')!;
  build();
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      build();
      if (last) paintLand(last);
    });
  });
}
