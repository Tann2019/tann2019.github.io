// The live sky over Billings, and the desktop theme generated from it.
// Sky colors come from dynamic-sky's single-scattering model (Apache-2.0, github.com/aakaashjois/dynamic-sky).
import 'dynamic-sky';
import { THEME_VARS, type ThemeVar } from './theme';

export const BILLINGS = { lat: 45.7833, lon: -108.5007, tz: 'America/Denver' };

const RAD = Math.PI / 180;

interface ScatteringRenderer {
  renderGradient(altitudeRad: number): string;
}

// Only the renderer is used: no init(), so no IP lookup and no SunCalc download.
const scattering: ScatteringRenderer = new (window as unknown as { DynamicSky: new (o: object) => ScatteringRenderer }).DynamicSky({
  latitude: 45.7833,
  longitude: -108.5007,
  autoDetectLocation: false,
  starLayers: 0,
});

/** Keep color in the sky through civil twilight, then let it fade to the night base. */
function renderAltitude(alt: number): number {
  if (alt >= -0.833) return alt;
  if (alt >= -6) return -0.833 + ((alt + 0.833) * 2.167) / 5.167;
  return -3 + (alt + 6) * 0.5;
}

const NIGHT_TOP = [10, 20, 48];
const NIGHT_HORIZON = [38, 56, 98];

/** How much the navy night base shows through: 0 in daylight, 1 once it's properly dark. */
function nightAmount(alt: number): number {
  return Math.min(1, Math.max(0, (-alt + 1) / 10));
}

/** The scattering stops, as [r, g, b] from top to horizon. */
function scatteringStops(alt: number): number[][] {
  const css = scattering.renderGradient(renderAltitude(alt) * RAD);
  return Array.from(css.matchAll(/rgb\((\d+), (\d+), (\d+)\)/g), (m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
}

/** Screen blend, the same math the browser does for mix-blend-mode: screen. */
function screen(a: number[], b: number[]): number[] {
  return a.map((v, i) => 255 - ((255 - v) * (255 - b[i])) / 255);
}

/** Top, middle and horizon colors of the sky as displayed, for swatches and the scrubber track. */
export function skyColorsAt(alt: number): { top: string; mid: string; horizon: string } {
  const stops = scatteringStops(alt);
  const n = nightAmount(alt);
  const base = (t: number) => NIGHT_TOP.map((v, i) => (v + (NIGHT_HORIZON[i] - v) * t) * n);
  const at = (t: number) => screen(stops[Math.round(t * (stops.length - 1))], base(t));
  return { top: rgbToHex(at(0)), mid: rgbToHex(at(0.5)), horizon: rgbToHex(at(1)) };
}

// ---------------------------------------------------------------- palettes

type Keyframe = Record<string, string>;

// UI inks for four sun altitudes. The sky and land compute their own colors; these drive
// the windows, the accent and the sun and moon discs. Everything in between is blended.
const KEYFRAMES: { alt: number; inks: Keyframe }[] = [
  {
    alt: -14,
    inks: { sun: '#f6d9a0', moon: '#e9e4d2', bg: '#0d1324', fg: '#e7e3d8', muted: '#8e95ab', accent: '#f0b45a', line: '#2a3350' },
  },
  {
    alt: -6,
    inks: { sun: '#ffd3a0', moon: '#f1e6da', bg: '#16152a', fg: '#f0e4dc', muted: '#a197b1', accent: '#f3a69c', line: '#332f4f' },
  },
  {
    alt: 3,
    inks: { sun: '#fff0c2', moon: '#f6efe2', bg: '#1f1a1a', fg: '#f7e9d7', muted: '#b6a38f', accent: '#f6b565', line: '#3d3330' },
  },
  {
    alt: 20,
    inks: { sun: '#fffbea', moon: '#f4f7fb', bg: '#0f2036', fg: '#eaf1f8', muted: '#97abc2', accent: '#8ec8ff', line: '#24405f' },
  },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function inksForAltitude(alt: number): Keyframe {
  if (alt <= KEYFRAMES[0].alt) return KEYFRAMES[0].inks;
  const last = KEYFRAMES[KEYFRAMES.length - 1];
  if (alt >= last.alt) return last.inks;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    if (alt >= a.alt && alt <= b.alt) {
      const t = (alt - a.alt) / (b.alt - a.alt);
      const out: Keyframe = {};
      for (const key of Object.keys(a.inks)) out[key] = mix(a.inks[key], b.inks[key], t);
      return out;
    }
  }
  return last.inks;
}

// --------------------------------------------------------------- sun & moon

/** Days since J2000.0 (2000-01-01 12:00 UTC). */
function daysSinceJ2000(date: Date): number {
  return date.getTime() / 86400000 - 10957.5;
}

function obliquity(d: number): number {
  return (23.439 - 0.00000036 * d) * RAD;
}

function sunEclipticLongitude(d: number): number {
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  return (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
}

/** Altitude and azimuth (degrees, azimuth clockwise from north) for a point on the ecliptic. */
function horizontal(L: number, d: number, lat: number, lon: number) {
  const e = obliquity(d);
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const H = (gmst * 15 + lon) * RAD - ra;
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { alt: alt / RAD, az: (az / RAD + 360) % 360 };
}

export function sunPosition(date: Date) {
  const d = daysSinceJ2000(date);
  return horizontal(sunEclipticLongitude(d), d, BILLINGS.lat, BILLINGS.lon);
}

const SYNODIC_MONTH = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/** 0 = new, 0.5 = full. */
export function moonAge(date: Date): number {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  return (((days / SYNODIC_MONTH) % 1) + 1) % 1;
}

/** The moon sits roughly `age` of a turn east of the sun along the ecliptic. Good enough for a poster. */
export function moonPosition(date: Date) {
  const d = daysSinceJ2000(date);
  const L = sunEclipticLongitude(d) + moonAge(date) * 2 * Math.PI;
  return horizontal(L, d, BILLINGS.lat, BILLINGS.lon);
}

// ------------------------------------------------------------ Billings time

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BILLINGS.tz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function tzParts(date: Date) {
  const o: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

function tzOffset(date: Date): number {
  const p = tzParts(date);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** Minutes past midnight, Billings time. */
export function billingsMinutes(date: Date): number {
  const p = tzParts(date);
  return p.hour * 60 + p.minute;
}

/** The instant that is `minutes` past midnight on the Billings calendar day containing `ref`. */
export function billingsDateAt(minutes: number, ref: Date): Date {
  const p = tzParts(ref);
  const guess = Date.UTC(p.year, p.month - 1, p.day, 0, minutes);
  let t = guess - tzOffset(new Date(guess));
  const corrected = guess - tzOffset(new Date(t));
  if (corrected !== t) t = corrected;
  // 2:00-2:59 AM doesn't exist on the spring-forward day; carry it on to 3:xx instead of falling back.
  const got = billingsMinutes(new Date(t));
  if (got !== minutes % 1440 && minutes < 1440) t += (minutes - got) * 60000;
  return new Date(t);
}

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: BILLINGS.tz, hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: BILLINGS.tz, weekday: 'long', month: 'long', day: 'numeric' });
const shortDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: BILLINGS.tz, weekday: 'short', month: 'short', day: 'numeric' });

export const formatTime = (d: Date) => timeFmt.format(d);
export const formatDay = (d: Date) => dayFmt.format(d);
export const formatShortDay = (d: Date) => shortDayFmt.format(d);

/** Sunrise and sunset for the Billings day containing `ref`, found by scanning the day minute by minute. */
const eventCache = new Map<string, { rise: Date | null; set: Date | null }>();

export function sunEvents(ref: Date) {
  const key = formatShortDay(ref);
  const cached = eventCache.get(key);
  if (cached) return cached;
  const start = billingsDateAt(0, ref).getTime();
  let rise: Date | null = null;
  let set: Date | null = null;
  let prev = sunPosition(new Date(start)).alt;
  for (let m = 1; m <= 1440; m++) {
    const t = start + m * 60000;
    const alt = sunPosition(new Date(t)).alt;
    if (prev < -0.833 && alt >= -0.833) rise = new Date(t);
    if (prev >= -0.833 && alt < -0.833) set = new Date(t);
    prev = alt;
  }
  const events = { rise, set };
  eventCache.set(key, events);
  return events;
}

export function phaseName(alt: number, date: Date): string {
  if (alt < -12) return 'Night';
  if (alt < -4) return 'Blue hour';
  if (alt < 6) return 'Golden hour';
  const m = billingsMinutes(date);
  if (m < 11 * 60) return 'Morning';
  if (m < 14 * 60) return 'Midday';
  return 'Afternoon';
}

export function nextSunLine(date: Date): string {
  const { rise, set } = sunEvents(date);
  if (rise && date < rise) return `Sunrise at ${formatTime(rise)}`;
  if (set && date < set) return `Sunset at ${formatTime(set)}`;
  // Midday tomorrow on the Billings calendar, so a DST change can't skip or repeat a day.
  const tomorrow = sunEvents(new Date(billingsDateAt(0, date).getTime() + 36 * 3600000)).rise;
  return tomorrow ? `Sunrise at ${formatTime(tomorrow)}` : '';
}

// --------------------------------------------------------------- painting

const VIEW_W = 1600;
const VIEW_H = 1000;
const HORIZON_Y = 700;
/** The sun tops out near 68° over Billings at the summer solstice. */
const MAX_ALT = 68;

/** Wide screens crop the top of the poster, so the sun's arc is fitted to the sky that's actually visible. */
function visibleSkyTop(svg: SVGSVGElement): number {
  const [, , vbW, vbH] = (svg.getAttribute('viewBox') ?? `0 0 ${VIEW_W} ${VIEW_H}`).split(' ').map(Number);
  const aspect = window.innerWidth / window.innerHeight;
  return aspect > vbW / vbH ? vbH - vbW / aspect : 0;
}

/** Wallpaper coordinates to screen pixels, honoring the viewBox and xMidYMax slice. */
function sceneToScreen(svg: SVGSVGElement, x: number, y: number) {
  const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? `0 0 ${VIEW_W} ${VIEW_H}`).split(' ').map(Number);
  const scale = Math.max(window.innerWidth / vw, window.innerHeight / vh);
  return {
    x: (window.innerWidth - vw * scale) / 2 + (x - vx) * scale,
    y: window.innerHeight - vh * scale + (y - vy) * scale,
  };
}

/** Map azimuth (facing south: east on the left) and altitude to wallpaper coordinates. */
function toScene(az: number, alt: number, skyTop: number) {
  const x = ((az - 60) / 240) * VIEW_W;
  const y = HORIZON_Y - (alt / MAX_ALT) * (HORIZON_Y - skyTop - 90);
  return { x, y };
}

export interface SkySnapshot {
  date: Date;
  alt: number;
  inks: Keyframe;
  phase: string;
}

export function paintSky(svg: SVGSVGElement, date: Date): SkySnapshot {
  const sun = sunPosition(date);
  const inks = inksForAltitude(sun.alt);

  svg.querySelectorAll<SVGElement>('[data-ink]').forEach((el) => {
    el.setAttribute('fill', inks[el.dataset.ink!]);
  });

  const skyTop = visibleSkyTop(svg);

  // The sky itself: scattering gradient, a warm glow around the sun, and the navy night base under both.
  const skyEl = document.getElementById('sky');
  if (skyEl) {
    const { x, y } = toScene(sun.az, sun.alt, skyTop);
    const p = sceneToScreen(svg, x, y);
    const nearHorizon = Math.max(0, 1 - Math.abs(sun.alt) / 12);
    const glow = sun.alt > -6 ? 0.16 + 0.42 * nearHorizon : 0;
    skyEl.style.backgroundImage =
      `radial-gradient(circle at ${p.x.toFixed(0)}px ${p.y.toFixed(0)}px, rgb(255 214 160 / ${glow.toFixed(3)}) 0, ` +
      `rgb(255 170 110 / ${(glow * 0.45).toFixed(3)}) 14vmax, transparent 42vmax), ` +
      scattering.renderGradient(renderAltitude(sun.alt) * RAD);
  }
  const base = document.getElementById('sky-base');
  if (base) base.style.opacity = nightAmount(sun.alt).toFixed(3);

  const sunG = svg.querySelector<SVGGElement>('#sky-sun');
  if (sunG) {
    const { x, y } = toScene(sun.az, sun.alt, skyTop);
    sunG.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    sunG.style.opacity = sun.alt < -3 ? '0' : '1';
  }

  // Darkness drives the stars and how bright the moon looks.
  const dark = Math.min(1, Math.max(0, (-sun.alt - 2) / 9));
  const stars = svg.querySelector<SVGGElement>('#sky-stars');
  if (stars) stars.style.opacity = String(dark);

  const moonG = svg.querySelector<SVGGElement>('#sky-moon');
  if (moonG) {
    const moon = moonPosition(date);
    const age = moonAge(date);
    const lit = (1 - Math.cos(2 * Math.PI * age)) / 2;
    const { x, y } = toScene(moon.az, moon.alt, skyTop);
    moonG.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    // Daytime moons are faint, the way they are outside.
    const visible = moon.alt > -2 && lit > 0.04;
    moonG.style.opacity = visible ? String(0.35 + 0.65 * dark) : '0';
    // The shadow lives in the mask under <defs>, not inside the moon's group.
    const shadow = svg.querySelector<SVGCircleElement>('#moon-mask .moon-shadow');
    if (shadow) {
      // The shadow disc is a touch larger than the moon (r 26) so a full moon leaves no sliver.
      const offset = 54 * lit;
      // Waxing moons are lit on the right in the northern hemisphere, so the shadow slides left.
      shadow.setAttribute('cx', String(age < 0.5 ? -offset : offset));
    }
  }

  return { date, alt: sun.alt, inks, phase: phaseName(sun.alt, date) };
}

/** Write the generated theme onto :root, the way pywal writes a palette for every app. */
export function applyTheme(inks: Keyframe, sky: { top: string; mid: string; horizon: string }) {
  const rgb = (hex: string) => hexToRgb(hex).join(' ');
  // Typed against THEME_VARS, so the list theme.ts saves and restores can't miss one.
  const theme: Record<ThemeVar, string> = {
    '--bg': inks.bg,
    '--bg-rgb': rgb(inks.bg),
    '--fg': inks.fg,
    '--fg-rgb': rgb(inks.fg),
    '--muted': inks.muted,
    '--accent': inks.accent,
    '--accent-rgb': rgb(inks.accent),
    '--line': inks.line,
    // Eight swatches sampled from the sky and the theme, shown in neofetch.
    '--c0': sky.top,
    '--c1': sky.mid,
    '--c2': sky.horizon,
    '--c3': inks.sun,
    '--c4': inks.moon,
    '--c5': inks.accent,
    '--c6': inks.muted,
    '--c7': inks.line,
  };
  const root = document.documentElement.style;
  for (const name of THEME_VARS) root.setProperty(name, theme[name]);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', sky.top);
}

// ----------------------------------------------------------------- weather

export interface Weather {
  temp: number;
  label: string;
  code: number;
  cloud: number;
  rain: number;
  snow: number;
  wind: number;
}

/** fetchWeather (weather.ts) writes it; anything can read it. */
export const CACHE_KEY = 'bigsky-weather-v2';

/** What fetchWeather got in the last 15 minutes, if anything. Article pages show this and never fetch. */
export function cachedWeather(): Weather | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null');
    if (cached && Date.now() - cached.at < 15 * 60000) return cached.weather;
  } catch {
    // Storage can be blocked.
  }
  return null;
}
