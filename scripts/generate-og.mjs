/**
 * Builds the Open Graph / social share cards under public/og/.
 * Run with: npm run og              (or: npm run og -- disdubs blog/hello-world)
 *
 * Each card is a dev-only page under /og-card/ (src/pages/og-card/) that paints the homepage's own sky,
 * land and clouds at a fixed moment. This starts the Astro dev server on 127.0.0.1:4399, opens every card
 * in headless Chrome (or Edge) with a throwaway profile, and writes a 1200×630 PNG per card. Set
 * CHROME_PATH to use another Chromium-based browser.
 *
 * Cards are read at roughly half size in a feed, so nothing on them is smaller than 22px.
 */
process.env.ASTRO_TELEMETRY_DISABLED = '1';
process.env.ASTRO_DISABLE_UPDATE_CHECK = 'true';

import { dev } from 'astro';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'og');
// Card hashes. Seo.astro versions card URLs with them, and blog pages read it to find a post's card.
const manifestPath = join(root, 'src', 'redesign', 'og-cards.json');

const W = 1200;
const H = 630;
const HOST = '127.0.0.1';
const PORT = 4399;
/** The only places a card may load from besides the dev server. */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
/**
 * Stands in for Vite's dev client, whose only job on a card would be opening a reload socket. dynamic-sky's
 * prebundled code imports injectQuery for a lazy import that sky.ts never triggers.
 */
const VITE_CLIENT_STUB = 'export const injectQuery = (url) => url;';

function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.');
  return found;
}

let server;
let browser;
let profile;

try {
  server = await dev({
    root,
    logLevel: 'warn',
    server: { host: HOST, port: PORT },
    devToolbar: { enabled: false },
    // No hot reload: an edit mid-run must not reload a card between paint and screenshot.
    vite: { server: { hmr: false, strictPort: true } },
  });
  const origin = `http://${HOST}:${server.address.port}`;

  // The index page lists every card, so posts are picked up without touching this script.
  const res = await fetch(`${origin}/og-card/`);
  if (!res.ok) throw new Error(`${origin}/og-card/ returned ${res.status}. Check the dev server output above.`);
  const index = await res.text();
  const all = [...index.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1]);
  if (!all.length) throw new Error(`No cards listed at ${origin}/og-card/`);
  const unknown = process.argv.slice(2).filter((s) => !all.includes(s));
  if (unknown.length) throw new Error(`No such card: ${unknown.join(', ')}. Cards: ${all.join(', ')}`);
  const slugs = process.argv.length > 2 ? process.argv.slice(2) : all;

  // A fresh profile in the temp dir: never the everyday browser profile, nothing carried between runs.
  profile = await mkdtemp(join(tmpdir(), 'og-chrome-'));
  browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    userDataDir: profile,
    args: ['--force-color-profile=srgb', '--disable-gpu', '--hide-scrollbars'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  // Clouds drift unless motion is reduced; frozen, every run paints the same frame.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  // A card loads the dev server and Google Fonts, nothing else, and opens no sockets.
  const blocked = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = new URL(req.url());
    const local = url.hostname === HOST && url.port === String(server.address.port);
    if (local && url.pathname === '/@vite/client') return req.respond({ contentType: 'text/javascript', body: VITE_CLIENT_STUB });
    if (local || url.protocol === 'data:' || FONT_HOSTS.includes(url.hostname)) return req.continue();
    blocked.push(req.url());
    req.abort();
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', ({ url }) => blocked.push(url));
  // A script that fails to load never sets __ogError itself, so report it from here instead of timing out.
  page.on('pageerror', (err) => page.evaluate((msg) => (window.__ogError ??= msg), err.message).catch(() => {}));

  for (const slug of slugs) {
    await page.goto(`${origin}/og-card/${slug}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__ogReady || window.__ogError, { timeout: 60000 });
    if (blocked.length) throw new Error(`${slug}: unexpected network requests:\n  ${blocked.join('\n  ')}`);
    const error = await page.evaluate(() => window.__ogError);
    if (error) throw new Error(`${slug}: ${error}`);

    // A missing font silently falls back to system-ui, which would ship a card in the wrong type.
    const fonts = await page.evaluate(() =>
      ['National Park', 'Overpass'].map((family) => ({
        family,
        ok:
          document.fonts.check(`700 40px "${family}"`) &&
          [...document.fonts].some((f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded'),
      })),
    );
    const missing = fonts.filter((f) => !f.ok).map((f) => f.family);
    if (missing.length) throw new Error(`${slug}: fonts did not load: ${missing.join(', ')}`);

    // Rendered at 2x, then downscaled, so small text and ridge edges come out clean.
    const shot = await page.screenshot({ type: 'png' });
    const file = join(outDir, `${slug}.png`);
    await mkdir(dirname(file), { recursive: true });
    await sharp(shot).resize(W, H, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(file);
    console.log('wrote', `public/og/${slug}.png`);
  }

  const stale = (await readdir(join(outDir, 'blog')).catch(() => []))
    .filter((f) => f.endsWith('.png') && !all.includes(`blog/${f.slice(0, -4)}`));
  for (const f of stale) console.warn(`stale: public/og/blog/${f} has no post. Delete it if the post is gone.`);

  // Feeds cache previews by image URL, so a changed card needs a new one.
  const manifest = {};
  for (const slug of all) {
    const file = join(outDir, `${slug}.png`);
    if (existsSync(file)) manifest[slug] = createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 10);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('wrote', 'src/redesign/og-cards.json');
} finally {
  await browser?.close();
  await server?.stop();
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
}
