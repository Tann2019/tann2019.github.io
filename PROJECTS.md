# Projects

A curated list of repositories worth featuring on the site. Generated 2026-05-06 from the GitHub account `Tann2019`, with descriptions verified against each repo's README and source. Update order/wording as needed before pulling into `src/pages/index.astro`.

---

## Featured

### Gridiron Duels — *Real-Time Fantasy Football Draft Platform*
- **Repo:** `GridIron-Duels` (private)
- **Site:** https://gridiron-duels.com/
- **Stack:** Laravel · React · Expo · WebSockets · Stripe
- Service-oriented backend with dedicated engines for draft orchestration, CPU AI, scoring, and event-driven post-game hooks. Multiple game modes (1v1, League up to 16, VS CPU, Crazy Mode, Time Machine, Weekly Challenges across all 18 NFL weeks), live presence chat, leaderboards, battle pass, cosmetics, and Stripe-powered coin shop.
- **Companion:** `Gridiron-Discord-Bot` (private, TypeScript) — Discord integration for the platform.

---

## Public Projects

### tann2019.github.io
- **Stack:** Astro
- **Live:** https://tann2019.github.io/
- This portfolio + blog. Static, fast, deployed to GitHub Pages.

### Twitch Codes — *VS Code Extension*
- **Repo:** `twitch-codes` (public, JavaScript)
- A VS Code extension that bridges Twitch chat with your editor. Viewers can highlight lines, suggest code changes, vote on suggested changes, and scroll the editor — all via chat commands like `!highlight`, `!suggest`, `!yes`/`!no`, `!scrollto`.

### Zed Blade Support — *Editor Extension*
- **Repo:** `zed-blade-support` (public, Scheme)
- Adds Laravel Blade syntax highlighting to the [Zed editor](https://zed.dev) via tree-sitter-blade.

### Gundam TCG Deck Builder
- **Repo:** `Gundam` (public, Blade) ★1
- **Stack:** Laravel 11 · Livewire · Tailwind · MongoDB
- Prototype web app for Gundam Trading Card Game enthusiasts to search cards and build decks. Dark space-themed UI.

### Tech News Gram — *Automated Short-Form Video Generator*
- **Repo:** `tech-news-gram` (public, Python) ★2
- **Stack:** Python · NewsAPI · ElevenLabs (TTS) · Whisper (STT) · FFmpeg · Docker
- Pulls tech news, generates voiceover with ElevenLabs, transcribes with Whisper for SRT subtitles, composites the video with FFmpeg, and uploads to TikTok automatically.

### NBA Scraper
- **Repo:** `NBA-Scraper` (public, Python)
- **Stack:** Flask · BeautifulSoup · Tabulate
- Flask web app that scrapes team stats from basketball-reference.com and renders them as an HTML table.

### MT Programmers Discord Bot
- **Repo:** `MTProgrammersDiscordBot` (public, JavaScript)
- **Stack:** discord.js · @sern/handler · Puppeteer · Cheerio
- Discord bot for the Montana Programmers community, with headless-browser scraping support.

### Godot — Hello
- **Repo:** `Godot--Hello` (public, Godot)
- **Live:** https://tann2019.github.io/Godot--Hello/
- First Godot project — a small particle/text demo exported to the web via the Godot HTML5 export.

### Advent of Code
- **Repo:** `advent-of-code` (public, PHP)
- Personal solutions to Advent of Code puzzles, written in PHP.

---

## Private / In-Progress (link as "private repo")

These are active or shipped projects whose source isn't public. Worth listing with name + summary; omit the GitHub link or label them `private`.

### HourCrew — *Photo-a-Day with Friends*
- **Repo:** `HourCrew` (private, TypeScript)
- **Stack:** Expo (React Native) · Next.js · NextAuth · PostgreSQL · S3 · FFmpeg · Turborepo (pnpm)
- Mobile + backend monorepo for taking a photo every hour with your crew. Shared TypeScript package handles types, Zod schemas, and hour-window math across both apps.

### Mort — *Personal AI Assistant*
- **Repo:** `Mort` (private, TypeScript)
- **Stack:** Telegram Bot · Groq LLM · Anthropic Claude · Claude Code CLI · GitHub CLI
- Local-first AI assistant accessed via Telegram. Acts as an autonomous development agent that can spawn Claude Code to write full PRs across multiple repos, plus chat, code review, reminders, notes, web search, and proactive hourly check-ins. Designed to run on a Raspberry Pi.

### Montarev — *Notion ↔ Discord Integration*
- **Repo:** `Montarev_Notion` (private, TypeScript)
- **Stack:** Node.js · Notion API · discord.js · PostgreSQL
- Bidirectional sync: Notion task webhooks create Discord embeds and threads on assignment (turning green when marked Done); a `/update` slash command appends structured update blocks back to the Notion page from inside the thread.

### DnD Mothership
- **Repo:** `DND-ESP32` (private, C++)
- **Stack:** ESP32 (PlatformIO + LVGL) · Node.js (Express + ws) · WebSockets
- Tabletop D&D companion system — each player carries a 3.5" ESP32 touchscreen showing stats, HP, and spell slots; a Node.js "mothership" on the DM's laptop pushes live updates and notifications from a web dashboard. Supports HP +/-, spell-slot use, long-rest, and toast popups.

### RPi Dashboard
- **Repo:** `RPi-Dashboard` (private, TypeScript)
- **Stack:** Next.js
- Next.js dashboard application running on a Raspberry Pi.

### StreamCode.Live — *Developer Streaming Platform*
- **Repo:** `StreamCode.Live` (private, PHP)
- **Stack:** Laravel · Blade
- Live-streaming platform for developers — auth, stream creation/editing, watch pages, and live chat messaging.

### Stream.Dev — *Streaming Platform (Earlier Iteration)*
- **Repo:** `Stream.Dev` (private, PHP)
- **Stack:** Laravel · Blade
- Earlier developer-focused streaming platform; foundation that informed StreamCode.Live.

### HyGambling — *Hytale Casino Plugin*
- **Repo:** `HyGambling` (private, Java)
- **Stack:** Java · Hytale Server Core
- Server-side gambling plugin for Hytale. Loot boxes (Common/Rare/Legendary), 3-reel slots with up to 100x multipliers, full roulette wheel with all standard bet types, per-player UUID-persisted balance, casino NPCs, statistics, and admin controls.

---

## Notes / Excluded

The following repos were intentionally excluded as forks, tutorials, playgrounds, configs, or essentially empty:

- **Forks (not original work):** `YMM-FILTER`, `Repo.Sdks`, `chillhop`, `extensions`, `multipleWindow3dScene`, `sharp-cooking-web-fork`
- **Profile / tutorials / playgrounds:** `Tann2019` (profile readme), `desktop-tutorial`, `Esp32-32E-playground`, `New-Project`
- **Likely incomplete / experimental:** `CasinoGame` (no language detected), `Maze-Ai-Training`, `Line-A-Day`, `fwd_hub_bot` (empty repo with stub file)
- **Excluded by request:** `DivaMode`, `odysseyclan`, `CatchCoin`

Move any of these into the lists above if they should be featured.
