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
- `/about/`, `/blog/*`, `/work/*` unchanged. SEO tags now come from `src/components/Seo.astro`.
- Share cards in `public/og/` are frames of the desktop at a fixed time of day. `npm run og` rebuilds them from the dev-only `/og-card/` pages (Chrome or Edge required). Rerun after adding a post.

## Code

`src/redesign/`: `sky` (sun math, scattering colors, theme), `land` (ridges), `weather`, `scene` (paints all three for one moment), `wm` (windows, workspaces, launcher, lock), `desktop` (icons), `terminal`, `radio`, `chess/*`, `apps/*` (synth, guestbook, cursors).

`styles.css` is the desktop. It imports the parts other pages can share from `css/` (`tokens`, `base`, `scene`, `bar`, `window`, `doc`), plus the desktop-only partials that sit between them, in the original order.

`src/data/`: case study facts (`disdubs`, `gridiron`, `caseStudies`), read by the homepage (windows, icons, launcher, neofetch) and the share cards.

Credits: sky colors from [dynamic-sky](https://github.com/aakaashjois/dynamic-sky) (Apache-2.0). Weather from [Open-Meteo](https://open-meteo.com). Fonts: National Park, Overpass (Google Fonts, OFL).

## Not done

- Case-study pages keep their own styling.
