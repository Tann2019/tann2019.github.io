/**
 * Builds the raster icons from public/favicon.svg.
 * Run with: node scripts/generate-icons.mjs
 *
 * favicon.svg is the source. Edit it, then rerun this:
 *   public/apple-touch-icon.png  180x180, full bleed, no alpha (iOS rounds the corners itself)
 *   public/favicon.ico           16, 32 and 48px PNGs, for clients that only ask for /favicon.ico
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

const svg = await readFile(join(pub, 'favicon.svg'), 'utf8');
const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
if (!viewBox || viewBox[1] !== viewBox[2]) throw new Error('favicon.svg needs a square viewBox starting at 0 0');
const grid = Number(viewBox[1]);

// The tile's rounded corners are a clip on the artwork. Dropping it gives the full-bleed square.
const CLIP = ' clip-path="url(#tile)"';
if (!svg.includes(CLIP)) throw new Error(`favicon.svg must wrap its artwork in a group with${CLIP}`);
const fullBleed = svg.replace(CLIP, '');

/** Rasterize straight at the target size, the way a browser draws an SVG favicon. */
const render = (source, size) =>
  sharp(Buffer.from(source), { density: (72 * size) / grid }).resize(size, size);

await render(fullBleed, 180)
  .flatten({ background: '#1f5fb6' })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(join(pub, 'apple-touch-icon.png'));

// An .ico is a directory of images. Modern readers accept PNG entries, so each size is stored as-is.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => render(svg, s).png({ compressionLevel: 9 }).toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size, at); // width
  header.writeUInt8(size, at + 1); // height
  header.writeUInt8(0, at + 2); // palette size
  header.writeUInt8(0, at + 3); // reserved
  header.writeUInt16LE(1, at + 4); // color planes
  header.writeUInt16LE(32, at + 6); // bits per pixel
  header.writeUInt32LE(pngs[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += pngs[i].length;
});
await writeFile(join(pub, 'favicon.ico'), Buffer.concat([header, ...pngs]));

console.log('Wrote public/apple-touch-icon.png and public/favicon.ico');
