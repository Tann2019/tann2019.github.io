// DisDubs: the facts its homepage window, share card and case study share.
import type { CaseStudy } from './case-studies';
// Masters for astro:assets. pick, cast and premiere also stay in public/work/disdubs/, where the page's
// SoftwareApplication screenshots point.
import pick from '../assets/work/disdubs/pick.png';
import cast from '../assets/work/disdubs/cast.png';
import slate from '../assets/work/disdubs/slate.png';
import rolling from '../assets/work/disdubs/rolling.png';
import booth from '../assets/work/disdubs/booth.png';
import premiere from '../assets/work/disdubs/premiere.png';

/** Where it stood one month after launch. */
const stats = [
  { value: '6,131', label: 'Servers have opened it', note: 'first month after launch', short: 'servers opened it in the first month' },
  { value: '241,502', label: 'Members reached', note: 'summed at last connect', short: 'members reached' },
  { value: '4,322', label: 'Servers finished a dub', note: '70% of everyone who opened it', short: 'servers finished a dub' },
  { value: '100+', label: 'Paying subscriptions', note: 'across two tiers', short: 'paying subscriptions' },
];

export const disdubs = {
  slug: 'disdubs',
  href: '/work/disdubs/',
  app: 'disdubs',
  icon: 'slate',
  title: 'DisDubs',
  launcher: 'Dubbing in Discord',
  site: { href: 'https://disdubs.com/', name: 'disdubs.com' },
  published: '2026-09-09T00:00:00-06:00',
  modified: '2026-09-10T00:00:00-06:00',
  lede: "A group dubbing game that runs inside Discord. Pick a scene, hand out the parts, and the whole voice channel performs it together while the script scrolls. Built on a platform that won't give it a microphone.",
  meta: [
    { label: 'Year', value: '2026' },
    { label: 'Role', value: 'Solo build' },
    { label: 'Platform', value: 'Discord Activity · Steam' },
    { label: 'Status', value: 'Live' },
  ],
  stats,
  /** How a dub gets made: six screens, in the order a room moves through them. */
  reel: [
    { title: 'Pick a scene', img: pick, alt: 'The scene picker, showing cover art for the public catalogue', line: 'The public shelf, plus whatever the server has uploaded itself.' },
    { title: 'Hand out parts', img: cast, alt: 'The casting screen, assigning characters to people in the room', line: 'Every character goes to somebody, or to nobody and stays original.' },
    { title: 'Slate', img: slate, alt: 'A clapperboard countdown over the scene, showing take 01', line: 'A clapper, a count of three, and the take number everyone is on.' },
    { title: 'Roll', img: rolling, alt: 'The take running, with the script scrolling over the clip', line: 'The clip plays, the script scrolls, each line lights up in turn.' },
    { title: 'Fix a line', img: booth, alt: 'The booth, showing one line’s waveform against the original', line: 'One flubbed line costs one line. Redo it against the original.' },
    { title: 'Premiere', img: premiere, alt: 'The screening view, playing the finished dub back to the room', line: 'Mix down, then watch it back together before anyone leaves.' },
  ],
  /** What it runs on, one row per layer. */
  stack: [
    { key: 'Runtime', value: 'Node 20 · TypeScript · npm workspaces' },
    { key: 'Client', value: 'Discord Embedded App SDK · Vite · no framework' },
    { key: 'Voice', value: 'discord.js 14 · @discordjs/voice receiver' },
    { key: 'Audio', value: 'Timeline-aligned PCM writer · ffmpeg adelay + amix' },
    { key: 'Transport', value: 'One WebSocket, one process, shared memory' },
    { key: 'Desktop', value: 'Electron shell for Steam, with on-device voice separation' },
    { key: 'Billing', value: 'Discord SKUs and entitlements' },
    { key: 'Infra', value: 'Single box behind Caddy · marketing site on Cloudflare' },
  ],
  window: {
    lede: 'A group dubbing game inside Discord. Pick a scene, hand out parts, and the voice channel performs it together.',
    meta: 'Discord Activity and Steam. Solo build, 2026.',
    stats: stats.map((s) => ({ value: s.value, label: s.short })),
  },
  card: {
    lede: 'A group dubbing game inside Discord',
    // Rounded, so three numbers still read at feed size.
    stats: [
      { value: '6,000+', label: 'servers' },
      { value: '240,000+', label: 'members reached' },
      { value: '70%', label: 'finished a dub' },
    ],
    scene: { minutes: 18 * 60 + 50, cloud: 20 },
  },
} satisfies CaseStudy;
