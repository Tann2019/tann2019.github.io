/**
 * Builds the Open Graph / social share cards under public/og/.
 * Run with: node scripts/generate-og.mjs
 *
 * These are read at roughly half size in a LinkedIn feed, so nothing here is
 * smaller than 20px and the copy is one line. Detail loses to legibility.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'og');

const W = 1200;
const H = 630;

const CREAM = '#e8e4df';
const MUTED = '#b3aba4';
const DIM = '#7d766f';
const ACCENT = '#c8956c';
const BG = '#0a0a0a';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The film perforations that edge the case study pages. */
function sprocket(y) {
  let out = '';
  for (let x = 0; x < W + 27; x += 27) {
    out += `<rect x="${x}" y="${y}" width="13" height="7" rx="1.5" fill="${CREAM}" opacity="0.09"/>`;
  }
  return out;
}

/** The clapperboard the app draws before every take. Stripes plus a take number. */
function slate({ x, y, w, h, take }) {
  const bar = 46;
  let stripes = '';
  for (let sx = -170; sx < w + 170; sx += 54) {
    stripes += `<rect x="${sx}" y="-24" width="27" height="${bar + 48}" fill="#e8e6e3"/>`;
  }
  return `
  <g transform="rotate(-6 ${x + w / 2} ${y + h / 2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#14100d" stroke="rgba(232,228,223,0.16)" stroke-width="1"/>
    <clipPath id="clap"><rect x="${x}" y="${y}" width="${w}" height="${bar}"/></clipPath>
    <g clip-path="url(#clap)">
      <g transform="translate(${x} ${y}) skewX(-20)">${stripes}</g>
    </g>
    <line x1="${x}" y1="${y + bar}" x2="${x + w}" y2="${y + bar}" stroke="rgba(232,228,223,0.18)" stroke-width="1"/>
    <text x="${x + w / 2}" y="${y + bar + 66}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="21" letter-spacing="5" fill="${DIM}">TAKE</text>
    <text x="${x + w / 2}" y="${y + bar + 134}" text-anchor="middle" font-family="Georgia, serif" font-size="76" font-weight="700" fill="${ACCENT}">${esc(take)}</text>
  </g>`;
}

function card({ eyebrow, title, titleSize, subtitle, stats, take, dot = ACCENT }) {
  // librsvg cannot measure text, so approximate advances and lay the stat
  // columns out left to right. Keeps long words from colliding.
  const valueW = (t) => t.length * 58 * 0.56;
  const labelW = (t) => t.length * (20 * 0.62 + 2.4);

  let cursor = 72;
  let statCells = '';
  for (const s of stats) {
    const x = cursor;
    cursor += Math.max(valueW(s.value), labelW(s.label)) + 82;
    statCells += `
  <text x="${x}" y="518" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${CREAM}">${esc(s.value)}</text>
  <text x="${x}" y="556" font-family="Segoe UI, sans-serif" font-size="20" letter-spacing="2.4" fill="${DIM}">${esc(s.label.toUpperCase())}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.12" cy="0.08" r="0.9">
      <stop offset="0%" stop-color="#c8956c" stop-opacity="0.15"/>
      <stop offset="65%" stop-color="#c8956c" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="#c8956c" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${sprocket(30)}
  ${sprocket(H - 37)}

  <circle cx="79" cy="117" r="6" fill="${dot}"/>
  <text x="99" y="124" font-family="Segoe UI, sans-serif" font-size="20" letter-spacing="5" fill="${ACCENT}">${esc(eyebrow.toUpperCase())}</text>

  <text x="72" y="262" font-family="Georgia, serif" font-size="${titleSize}" font-weight="700" fill="${CREAM}" letter-spacing="-3">${esc(title)}</text>
  <rect x="72" y="296" width="108" height="4" fill="${ACCENT}"/>

  <text x="72" y="368" font-family="Segoe UI, sans-serif" font-size="35" fill="${MUTED}">${esc(subtitle)}</text>

  <line x1="72" y1="448" x2="${W - 72}" y2="448" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  ${statCells}

  ${slate({ x: 800, y: 108, w: 328, h: 240, take })}
</svg>`;
}

const cards = {
  'disdubs.png': card({
    eyebrow: 'Case Study',
    title: 'DisDubs',
    titleSize: 126,
    subtitle: 'A group dubbing game inside Discord',
    stats: [
      { value: '6,000+', label: 'Servers' },
      { value: '240,000+', label: 'Members reached' },
      { value: '70%', label: 'Finished a dub' },
    ],
    take: '01',
    dot: '#e05252',
  }),
  'default.png': card({
    eyebrow: 'Software Engineer',
    title: 'Tanner Steorts',
    titleSize: 92,
    subtitle: 'Real-time systems and audio pipelines',
    stats: [
      { value: 'Discord', label: 'Activities' },
      { value: 'Audio', label: 'Pipelines' },
      { value: 'Full-stack', label: 'Product' },
    ],
    take: '01',
  }),
};

await mkdir(outDir, { recursive: true });
for (const [name, svg] of Object.entries(cards)) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(outDir, name));
  console.log('wrote', `public/og/${name}`);
}
