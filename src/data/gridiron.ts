// Gridiron Duels: the facts its homepage window, share card and case study share.
import type { CaseStudy } from './case-studies';

const stats = [
  { value: '3,400+', label: 'Players' },
  { value: '1,041,000+', label: 'Picks made' },
  { value: '16', label: 'Players per league' },
  { value: '50', label: 'Battle pass tiers' },
];

export const gridiron = {
  slug: 'gridiron-duels',
  href: '/work/gridiron-duels/',
  app: 'gridiron',
  icon: 'football',
  title: 'Gridiron Duels',
  launcher: 'Live football drafts',
  site: { href: 'https://gridiron-duels.com/', name: 'gridiron-duels.com' },
  appStore: 'https://apps.apple.com/us/app/gridiron-duels/id6759739525',
  essay: '/blog/gridiron-duels-architecture/',
  // The case study's first commit, 85e7300, and the move to the article layout with its figures. The page doesn't
  // print either.
  published: '2026-09-09T13:09:40-06:00',
  modified: '2026-10-20T00:00:00-06:00',
  lede: 'A real-time fantasy football draft platform — built end-to-end across web, mobile, and a service-oriented backend that runs the league.',
  meta: [
    { label: 'Year', value: '2025—2026' },
    { label: 'Role', value: 'Designer & Engineer' },
    { label: 'Team', value: 'Solo build' },
    { label: 'Status', value: 'Live' },
  ],
  stats,
  /** The roster behind the roster: one row per position in the stack. */
  stack: [
    { key: 'Backend', value: 'Laravel 12 · PHP 8.3 · Octane / RoadRunner' },
    { key: 'Frontend', value: 'React 19 · Inertia.js · Tailwind CSS' },
    { key: 'Mobile', value: 'Expo SDK 54 · React Native' },
    { key: 'Real-time', value: 'Laravel Reverb (Pusher protocol)' },
    { key: 'Database', value: 'PostgreSQL' },
    { key: 'Payments', value: 'Stripe (checkout + virtual currency)' },
    { key: 'Infra', value: 'Laravel Cloud · scheduler · queue workers' },
  ],
  window: {
    lede: 'Live fantasy football drafts against friends or the CPU, on web and mobile.',
    meta: 'Laravel, React, Expo, WebSockets, Stripe.',
  },
  card: {
    lede: 'Real-time fantasy football drafts',
    // The first two headline numbers.
    stats: stats.slice(0, 2).map((s) => ({ value: s.value, label: s.label.toLowerCase() })),
    scene: { minutes: 14 * 60 + 30, cloud: 35 },
  },
} satisfies CaseStudy;
