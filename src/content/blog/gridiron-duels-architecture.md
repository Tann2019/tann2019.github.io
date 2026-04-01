---
title: "GridIron Duels - Architecture Overview"
description: "A deep dive into the tech stack, real-time draft engine, game modes, and service-oriented economy powering GridIron Duels."
pubDate: 2026-04-01
tags: ["laravel", "react", "architecture", "websockets", "react-native"]
---

[GridIron Duels](https://gridiron-duels.com/) is a real-time fantasy football draft platform I built from scratch. Web app, mobile app, and everything in between. This post breaks down the architecture decisions, how the pieces fit together, and why I built it the way I did.

## The Stack

- **Backend:** Laravel 12 on PHP 8.3, running on Laravel Octane with RoadRunner for persistent workers and faster request handling
- **Frontend (Web):** React 19 via Inertia.js, styled with Tailwind CSS
- **Frontend (Mobile):** Expo SDK 54 (React Native)
- **Real-Time:** Laravel Reverb using the Pusher protocol for WebSocket communication
- **Database:** PostgreSQL in production
- **Payments:** Stripe for checkout and virtual currency purchases
- **Infrastructure:** Managed through Laravel Cloud with scheduled tasks, queue workers, and zero-downtime deploys

## Hybrid SPA: Two Stacks, One App

Not everything needs to be a single-page app. Public-facing pages like the homepage, leaderboard, and blog are server-rendered Blade views. Fast initial loads, good SEO, minimal JavaScript. The interactive features (draft room, shop, achievements, admin panel) are React/Inertia pages with full client-side interactivity.

Both stacks share authentication state through Inertia's `HandleInertiaRequests` middleware, so a user can land on a Blade-rendered leaderboard page, click into a React-powered draft room, and never hit a login wall or experience a jarring transition.

## The Real-Time Draft Engine

This is the core of the app. `DraftEngine` is a single service class that orchestrates the full game lifecycle: create, join, ready-up, pick, score, and complete. Every state transition broadcasts an event (`PlayerDrafted`, `TurnUpdated`, `GameCompleted`, and others) via Laravel Reverb.

Both the web client (using Laravel Echo) and the mobile client (using `pusher-js`) subscribe to the same channels and receive the same events in real time. A player can start a draft on their laptop and their friend can join from their phone. Same experience.

### Turn Timers

Turn timers are driven by the frontend (`DraftTimer.jsx`) for responsiveness. The countdown runs client-side so there's no perceived lag. A backend Artisan command (`draft:check-timers`) runs every 30 seconds as a safety net, auto-picking for any player whose timer expired while disconnected. This two-layer approach means the UX feels snappy while the game state stays consistent even when clients drop.

## Game Mode Polymorphism

Games are built from composable pieces rather than hard-coded mode logic:

**GameFormat** defines the structure: 1v1 head-to-head, 2v2 team drafts, or League mode for larger groups. Each format determines player count, draft order, and scoring rules.

**Modifiers** layer on top:

- `cpu_fill` - AI opponents fill empty slots so you can always play. `CpuOpponentEngine` runs at three difficulty levels with randomized thinking delays so CPU picks feel natural rather than instant.
- `crazy_mode` - `CrazyModeEngine` generates randomized scoring rules at game creation: Double Trouble, Position Chaos, Reverse Scoring, and more. These modifiers are stored with the game and evaluated at scoring time, so every crazy mode game plays differently.
- `past_seasons` - Draft using historical NFL data for "what if" scenarios.

This composition means adding a new modifier doesn't require touching the core draft logic at all.

## Service-Oriented Economy

Monetization and progression are split into focused services, each owning its own domain:

### CoinService
Virtual currency that backs the entire economy. Handles atomic balance transactions, wager escrow with a house rake on competitive matches, and Stripe-powered coin purchases. Every transaction is logged for auditability.

### BattlePassService
Seasonal 50-tier progression with free and premium tracks. XP flows in from gameplay (wins, draft completions, missions) and unlocks rewards at each tier. Resets each season with new content.

### CosmeticShopService
A daily rotating shop selling cosmetic items: name colors, player titles, profile borders, and banners. The rotation keeps the shop feeling fresh and creates urgency without being predatory. Items are purely cosmetic, no pay-to-win.

### MissionService
Daily and weekly objectives (e.g., "Win 3 1v1 games", "Draft a player from every NFC team") that reset on a scheduler. Missions feed XP into the battle pass and coins into the player's wallet, creating a gameplay loop that rewards consistent engagement.

### RankedService
Elo-based MMR system with 9 competitive tiers from Iron to Hall of Fame. Matchmaking runs on an expanding-window algorithm. It starts narrow (close skill match) and widens every 5 seconds until a match is found. This balances fair matches against reasonable queue times.

## Weekly Challenge Meta-Game

Every Wednesday, the scheduler automatically generates a weekly challenge: 10 random NFL teams are selected (excluding bye weeks), and every player drafts from the same pool. Since everyone has identical options, results come down to pure draft strategy.

Top 3 on the weekly leaderboard earn coin and XP payouts. The system is season-aware and can target historical weeks, which opens up "time machine" challenges where you draft knowing how players actually performed.

## Mobile API Layer

The Expo React Native app communicates through a dedicated `api/v1` route group with 16 controllers that mirror the web experience. Authentication uses Laravel Sanctum with tokens stored in `expo-secure-store`.

WebSocket auth goes through a dedicated broadcasting endpoint, so mobile clients connect to the same Reverb channels and receive identical real-time events as web users. There's no separate "mobile version" of the draft. It's the same game, same state, same events.

## Scheduler and Background Work

Nine scheduled tasks keep the system running without manual intervention:

| Task | Frequency | Purpose |
|------|-----------|---------|
| Sleeper API sync | Weekly | Pull latest NFL player and schedule data |
| Mission reset | Daily | Roll new daily objectives |
| Shop rotation | Daily | Refresh the cosmetic shop inventory |
| Battle pass check | Daily | Process tier rewards and season transitions |
| Matchmaking queue | Every 5s | Match ranked players using expanding-window algorithm |
| Timer safety net | Every 30s | Auto-pick for disconnected players |
| Stale game cleanup | Every 30 min | Close abandoned games and refund wagers |
| Weekly challenge | Wednesdays | Generate new challenge with random team pool |
| Leaderboard snapshot | End of week | Lock weekly results and distribute payouts |

All managed through Laravel Cloud's scheduler with monitoring and alerting.

## What's Next

GridIron Duels is live at [gridiron-duels.com](https://gridiron-duels.com/) and the mobile app is heading to the App Store and Play Store in 2026. I'm continuing to add game modes, seasonal content, and quality-of-life improvements based on player feedback.

If you have questions about any part of the architecture or want to talk shop about real-time Laravel apps, feel free to reach out.
