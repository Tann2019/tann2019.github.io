# Big Sky desktop

The homepage is a Linux-style desktop under a live sky over Billings, MT.

Run it: `npm run dev`, open http://localhost:4321/. Preview weather with `?weather=clear|cloudy|overcast|rain|snow|storm`.

## What's on it

| | |
| --- | --- |
| Lock screen | Once per session. Ring fills on any key or click |
| Desktop | Icons you can drag, rubber-band select, double-click. Positions saved per visitor. Arrow keys move between icons |
| Windows | Drag, resize, snap to halves (drag to an edge), maximize (double-click title), minimize to the taskbar |
| Bar | Launcher, workspaces 1–4, taskbar, tile button, weather, sunrise/sunset, clock, presence, lock |
| Launcher | `/` or the mesa button. Type to filter |
| Keys | `Alt+1–4` workspace, `Alt+Enter` terminal, `Alt+Shift+Q` close |
| Sky | Real sun and moon for Billings, scattering-model colors, stars. Scrub the day from the name block |
| Land | Procedural ridges with haze, valley mist, snow, forest and cabin lights, all colored from the sky |
| Weather | Open-Meteo for Billings: noise clouds sized by cloud cover, overcast veil, rain, snow |
| Theme | Window colors and accent follow the sky (amber night, rose dusk, gold sunset, blue midday) |

## Apps

| Icon | What |
| --- | --- |
| disdubs, gridiron-duels, mothership | Case-study summaries, linking to the full pages |
| work-history.txt, side-projects, writing | Résumé, smaller builds, blog posts |
| chess | Play Mort. Own engine (full rules, perft-tested), search in a Web Worker, promotion picker |
| synth | XY pad, scales, waveforms, delay. Pointer, touch and keyboard |
| sticky-notes | Draw a note and pin it to a shared wall |
| lofi-radio | lofi.srizan.dev embed with deck controls |
| terminal | neofetch plus `help`, `ls`, `open`, `sky`, `date` |
| say-hi | Email and GitHub |

Live cursors: other visitors' cursors show on the desktop, with a "N here" chip in the bar.

## Backend (guestbook + cursors)

`worker/` is a Cloudflare Worker at https://api.tannersteorts.com: D1 for notes, KV for rate limits, a Durable Object for cursors. Setup steps are in `worker/README.md`. The site reads the URL from `PUBLIC_BIGSKY_API` in `.env`.

Without it, the guestbook keeps notes in the visitor's browser and cursors stay off.

## Lofi radio

- Iframe loads only when the window opens and unloads on close. Keeps playing while minimized.
- Upstream PR to SrIzan10/lofi adds `?embed=1&volume=15`, a compact PiP layout and a `postMessage` API. Until it merges, the full player is scaled down to fit and the deck stays hidden.
- We don't pull audio directly: the player uses a reverse-engineered Chillhop API, so licensing is unclear for us.

## Pages

- `/` desktop. All window content is in the HTML. Without JS it reads as a plain column.
- `/classic/` the old homepage, `noindex`, linked as "Skip to the plain site".
- `/work/disdubs/` and `/work/gridiron-duels/` on `ArticleLayout` (see Article kit). DisDubs' `pick`, `cast` and `premiere.png` also stay in `public/work/disdubs/` for the JSON-LD screenshot URLs.
- `/about/`, `/blog/*` unchanged. SEO tags now come from `src/components/Seo.astro`.
- Share cards in `public/og/` are frames of the desktop at a fixed time of day. `npm run og` rebuilds them from the dev-only `/og-card/` pages (Chrome or Edge required). Rerun after adding a post.

## Code

`src/redesign/`: `sky` (sun math, scattering colors, theme), `land` (ridges), `weather` (clouds, rain and snow, and the desktop's Open-Meteo fetch), `scene` (paints all three for one moment, and saves the theme), `theme` (the theme kept in sessionStorage between pages; `RestoreTheme.astro` puts it back before first paint), `wm` (windows, workspaces, launcher, lock), `windows` (the window list and the unlocked flag's key, safe to read on the server), `desktop` (icons), `terminal`, `radio`, `chess/*`, `apps/*` (synth, guestbook, cursors), `article` (an article page's scene, sun line and clock).

`styles.css` is the desktop. It imports the parts other pages can share from `css/` (`tokens`, `base`, `scene`, `bar`, `window`, `doc`), plus the desktop-only partials that sit between them, in the original order. `css/article.css` imports the same shared parts for article pages.

`src/data/`: case study facts (`disdubs`, `gridiron`, `caseStudies`), read by the homepage (windows, icons, launcher, neofetch), the share cards, the sitemap and the case studies.

## Article kit

`src/layouts/ArticleLayout.astro`, `src/components/article/`, `src/redesign/css/article.css` and `src/redesign/article.ts`. The sky and a cut-down bar, a glass header (`ArticleHead`, `StatRow`), then one tall window that scrolls with the page, holding `Chapter`, `Figure`, `KeyRows`, `Ledger`, `Note` and `PrevNext`. The layout makes the BreadcrumbList from the breadcrumb in the window's title bar. Before first paint it restores the last page's theme and holds back the land and the bar's sun line and clock (and the sky, with no theme to restore) until `article.ts` paints, then fades them in. Preview any time of day with `?at=18:50` (dev only).

To add a case study:

1. Its facts in `src/data/<slug>.ts`, added to `caseStudies` (which also lists it in the sitemap): title, lede, meta, stats, `published` and `modified` (JSON-LD, `article:*` tags, sitemap `lastmod`), plus the homepage window's and share card's copy.
2. Its homepage window: `APPS` in `wm.ts`, plus its icon and `<Win>` in `index.astro`.
3. `src/pages/work/<slug>.astro` on `ArticleLayout`, with `name`, `app` (× goes to `/#<app>`), `icon` and the Seo props. Copy `disdubs.astro`. Page-only pieces go in the page's `<style>`, colored with the theme tokens.
4. `npm run og` for its share card.

Figures: PNG masters in `src/assets/work/<slug>/`, passed as `src`, ship as lazy AVIF and WebP with their size set. Web screens get `frame="window"` (the default, out to 64rem, `title` names the screen); iOS screens `frame="phone"` (a 280px bezel). Number them with `n` in document order.

A loop: `video={{ src, poster, width, height }}`, both files in `public/work/<slug>/`. It's muted and `preload="none"`, and `article.ts` plays it only while it's on screen, with a pause button (WCAG 2.2.2). Under reduced motion, even when it's turned on mid-visit, it stops on its poster until played; without JS the poster shows. Encode H.264 with no audio and `+faststart`, shown at its own width at most (Gridiron's: 540px, 4.2s, 42 KB).

After a build, `npm run check:overflow` loads the built pages at 320, 375, 768 and 1280px and fails if any scrolls sideways.

Credits: sky colors from [dynamic-sky](https://github.com/aakaashjois/dynamic-sky) (Apache-2.0). Weather from [Open-Meteo](https://open-meteo.com). Fonts: National Park, Overpass (Google Fonts, OFL).

## Not done

- The blog and /about/ keep their own styling.
