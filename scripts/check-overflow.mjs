/**
 * Fails if a built page scrolls sideways. Run after `npm run build`:
 *   npm run check:overflow                         (every page in dist/)
 *   npm run check:overflow -- work/disdubs/ home   (some pages; home is /. Git Bash rewrites a leading /, so leave it off)
 *
 * Serves dist/ on 127.0.0.1 and opens each page in headless Chrome (or Edge) with a throwaway profile at 320, 375, 768
 * and 1280px wide. Any page whose document is wider than the viewport fails, with the elements that stick out. Every
 * host but 127.0.0.1 and Google Fonts resolves to nothing, so no page reaches the network. Set CHROME_PATH to use
 * another Chromium-based browser.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const WIDTHS = [320, 375, 768, 1280];
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.json': 'application/json', '.xml': 'application/xml', '.woff2': 'font/woff2',
};

/** The same search as generate-og.mjs. */
function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const found = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.');
  return found;
}

/** Every page in dist/, as URL paths. */
async function allPages(dir = dist) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await allPages(p)));
    else if (entry.name === 'index.html') out.push(`/${relative(dist, dir).split(sep).join('/')}/`.replace('//', '/'));
  }
  return out.sort();
}

if (!existsSync(join(dist, 'index.html'))) throw new Error('No dist/index.html. Run `npm run build` first.');
const args = process.argv.slice(2);
const paths = args.length ? args.map((a) => (a === 'home' ? '/' : `/${a.replace(/^\/+/, '')}`)) : await allPages();

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const file = join(dist, p);
    if ((await stat(file)).isDirectory()) return res.writeHead(301, { location: `${p}/` }).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const profile = await mkdtemp(join(tmpdir(), 'overflow-chrome-'));
let browser;
let failed = 0;
try {
  browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    userDataDir: profile,
    args: ['--hide-scrollbars', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com'],
  });
  const page = await browser.newPage();
  for (const path of paths) {
    for (const width of WIDTHS) {
      const phone = width < 768;
      await page.setViewport({ width, height: phone ? 844 : 900, isMobile: phone, hasTouch: phone });
      await page.goto(origin + path, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 300));
      const result = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        if (sw <= vw) return { vw, sw, culprits: [] };
        // The outermost elements past the right edge, skipping fixed ones and anything a narrower scroller clips.
        const clipped = (el) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= vw + 1) return true;
          }
          return false;
        };
        const over = [...document.body.querySelectorAll('*')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && !clipped(el);
        });
        const culprits = over
          .filter((el) => !over.includes(el.parentElement))
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].map((c) => `.${c}`).join('')} (right edge ${Math.round(el.getBoundingClientRect().right)})`);
        return { vw, sw, culprits };
      });
      if (result.sw > result.vw) {
        failed++;
        console.log(`FAIL ${path} at ${width}px: ${result.sw}px wide`);
        for (const c of result.culprits) console.log(`       ${c}`);
      } else {
        console.log(`ok   ${path} at ${width}px`);
      }
    }
  }
} finally {
  await browser?.close();
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
if (failed) {
  console.error(`${failed} page width${failed === 1 ? '' : 's'} overflow.`);
  process.exit(1);
}
