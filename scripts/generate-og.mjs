/**
 * Builds the Open Graph / social share cards under public/og/.
 * Run with: node scripts/generate-og.mjs
 *
 * Typographic, not screenshots — a 1200x630 card is read at thumbnail size in a
 * LinkedIn feed, and a screenshot of a dense UI turns to mush there.
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
const MUTED = '#a29a93';
const DIM = '#6b6560';
const ACCENT = '#c8956c';
const BG = '#0a0a0a';

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The film-perforation strip that runs across the case study pages. */
function sprocket(y, opacity = 0.09) {
  const holes = [];
  for (let x = 0; x < W + 27; x += 27) {
    holes.push(`<rect x="${x}" y="${y}" width="13" height="7" rx="1.5" fill="${CREAM}" opacity="${opacity}"/>`);
  }
  return holes.join('');
}

/** The clapperboard the app draws before every take. */
function slate({ x, y, w, h, rotate, scene, prod, take }) {
  const bar = 44;
  const stripes = [];
  for (let sx = -160; sx < w + 160; sx += 52) {
    stripes.push(`<rect x="${sx}" y="-20" width="26" height="${bar + 40}" fill="#e8e6e3"/>`);
  }
  return `
  <g transform="rotate(${rotate} ${x + w / 2} ${y + h / 2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#14100d" stroke="rgba(232,228,223,0.14)" stroke-width="1"/>
    <clipPath id="clapclip"><rect x="${x}" y="${y}" width="${w}" height="${bar}"/></clipPath>
    <g clip-path="url(#clapclip)">
      <rect x="${x}" y="${y}" width="${w}" height="${bar}" fill="#14100d"/>
      <g transform="translate(${x} ${y}) skewX(-20)">${stripes.join('')}</g>
    </g>
    <line x1="${x}" y1="${y + bar}" x2="${x + w}" y2="${y + bar}" stroke="rgba(232,228,223,0.18)" stroke-width="1"/>
    ${[
      ['Scene', scene],
      ['Prod', prod],
    ]
      .map(
        ([k, v], i) => `
      <text x="${x + 26}" y="${y + bar + 52 + i * 58}" font-family="Segoe UI, sans-serif" font-size="13" letter-spacing="2.6" fill="${DIM}">${esc(k.toUpperCase())}</text>
      <text x="${x + 26}" y="${y + bar + 78 + i * 58}" font-family="Georgia, serif" font-size="23" fill="${CREAM}">${esc(v)}</text>`
      )
      .join('')}
    <text x="${x + w - 26}" y="${y + h - 62}" text-anchor="end" font-family="Segoe UI, sans-serif" font-size="13" letter-spacing="2.6" fill="${DIM}">TAKE</text>
    <text x="${x + w - 26}" y="${y + h - 24}" text-anchor="end" font-family="Georgia, serif" font-size="40" font-weight="700" fill="${ACCENT}">${esc(take)}</text>
  </g>`;
}

function card({ eyebrow, title, titleSize = 100, lines, stats, url, showSlate, dot = ACCENT }) {
  // No text measurement in librsvg, so approximate advance widths and lay the
  // stat columns out sequentially. Keeps long words from colliding.
  const wide = (t) => t.length * 42 * 0.56;
  const narrow = (t) => t.length * (13 * 0.62 + 2.2);

  let cursor = 72;
  const statCells = stats
    .map((s) => {
      const x = cursor;
      cursor += Math.max(wide(s.value), narrow(s.label)) + 52;
      return `
      <text x="${x}" y="500" font-family="Georgia, serif" font-size="42" font-weight="700" fill="${CREAM}">${esc(s.value)}</text>
      <text x="${x}" y="530" font-family="Segoe UI, sans-serif" font-size="13" letter-spacing="2.2" fill="${DIM}">${esc(s.label.toUpperCase())}</text>`;
    })
    .join('');
  const statRuleEnd = Math.min(cursor - 52, 728);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.14" cy="0.1" r="0.85">
      <stop offset="0%" stop-color="#c8956c" stop-opacity="0.16"/>
      <stop offset="60%" stop-color="#c8956c" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#c8956c" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${sprocket(34)}
  ${sprocket(H - 41)}
  <line x1="0" y1="24" x2="${W}" y2="24" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <line x1="0" y1="72" x2="${W}" y2="72" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <line x1="0" y1="${H - 51}" x2="${W}" y2="${H - 51}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <line x1="0" y1="${H - 24}" x2="${W}" y2="${H - 24}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>

  <circle cx="78" cy="131" r="5" fill="${dot}"/>
  <text x="94" y="137" font-family="Segoe UI, sans-serif" font-size="14" letter-spacing="3.4" fill="${ACCENT}">${esc(eyebrow.toUpperCase())}</text>

  <text x="72" y="${216 + (100 - titleSize) * 0.5}" font-family="Georgia, serif" font-size="${titleSize}" font-weight="700" fill="${CREAM}" letter-spacing="-2">${esc(title)}</text>
  <rect x="72" y="252" width="92" height="3" fill="${ACCENT}"/>

  ${lines
    .map(
      (l, i) =>
        `<text x="72" y="${312 + i * 38}" font-family="Segoe UI, sans-serif" font-size="26" fill="${MUTED}">${esc(l)}</text>`
    )
    .join('')}

  <line x1="72" y1="446" x2="${statRuleEnd}" y2="446" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>
  ${statCells}

  ${showSlate ? slate({ x: 800, y: 196, w: 336, h: 238, rotate: -6, scene: showSlate.scene, prod: showSlate.prod, take: showSlate.take }) : ''}

  <text x="${W - 72}" y="${H - 74}" text-anchor="end" font-family="Segoe UI, sans-serif" font-size="15" letter-spacing="1.6" fill="${DIM}">${esc(url)}</text>
</svg>`;
}

const cards = {
  'disdubs.png': card({
    eyebrow: 'Case Study · Tanner Steorts',
    title: 'DisDubs',
    lines: [
      'A group dubbing game inside Discord. The Activity is',
      'denied a microphone, so a bot records the voice channel',
      'and the audio is stitched back onto the timeline.',
    ],
    stats: [
      { value: '6,131', label: 'Servers opened it' },
      { value: '241,502', label: 'Members reached' },
      { value: '71%', label: 'Finished a dub' },
    ],
    url: 'tannersteorts.com/work/disdubs',
    dot: '#e05252',
    showSlate: { scene: 'Dub it together', prod: 'DisDubs', take: '01' },
  }),
  'default.png': card({
    eyebrow: 'Software Engineer · Billings, MT',
    title: 'Tanner Steorts',
    titleSize: 82,
    lines: [
      'Real-time systems, audio pipelines, and the kind of',
      'product work that ships to real users. Case studies,',
      'write-ups, and things built end to end.',
    ],
    stats: [
      { value: 'Real-time', label: 'Systems' },
      { value: 'Audio', label: 'Pipelines' },
      { value: 'Product', label: 'End to end' },
    ],
    url: 'tannersteorts.com',
    showSlate: { scene: 'Selected work', prod: 'Portfolio', take: '01' },
  }),
};

await mkdir(outDir, { recursive: true });
for (const [name, svg] of Object.entries(cards)) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(outDir, name));
  console.log('wrote', join('public/og', name));
}
