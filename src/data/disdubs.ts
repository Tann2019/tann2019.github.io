// DisDubs: the facts its homepage window, share card and case study share.
import type { CaseStudy } from './case-studies';

/** Where it stood one month after launch. */
const stats = [
  { value: '6,131', label: 'Servers have opened it', note: 'first month after launch' },
  { value: '241,502', label: 'Members reached', note: 'summed at last connect' },
  { value: '4,322', label: 'Servers finished a dub', note: '70% of everyone who opened it' },
  { value: '100+', label: 'Paying subscriptions', note: 'across two tiers' },
];

export const disdubs = {
  slug: 'disdubs',
  href: '/work/disdubs/',
  app: 'disdubs',
  icon: 'slate',
  title: 'DisDubs',
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
    { title: 'Pick a scene', img: '/work/disdubs/pick.png', alt: 'The scene picker, showing cover art for the public catalogue', line: 'The public shelf, plus whatever the server has uploaded itself.' },
    { title: 'Hand out parts', img: '/work/disdubs/cast.png', alt: 'The casting screen, assigning characters to people in the room', line: 'Every character goes to somebody, or to nobody and stays original.' },
    { title: 'Slate', img: '/work/disdubs/slate.png', alt: 'A clapperboard countdown over the scene, showing take 01', line: 'A clapper, a count of three, and the take number everyone is on.' },
    { title: 'Roll', img: '/work/disdubs/rolling.png', alt: 'The take running, with the script scrolling over the clip', line: 'The clip plays, the script scrolls, each line lights up in turn.' },
    { title: 'Fix a line', img: '/work/disdubs/booth.png', alt: 'The booth, showing one line’s waveform against the original', line: 'One flubbed line costs one line. Redo it against the original.' },
    { title: 'Premiere', img: '/work/disdubs/premiere.png', alt: 'The screening view, playing the finished dub back to the room', line: 'Mix down, then watch it back together before anyone leaves.' },
  ],
  window: {
    lede: 'A group dubbing game inside Discord. Pick a scene, hand out parts, and the voice channel performs it together.',
    meta: 'Discord Activity and Steam. Solo build, 2026.',
    // The same numbers, worded to stand without the page's notes.
    stats: ['servers opened it in the first month', 'members reached', 'servers finished a dub', 'paying subscriptions'].map(
      (label, i) => ({ value: stats[i].value, label }),
    ),
  },
  card: {
    lede: 'A group dubbing game inside Discord',
    // Rounded, so three numbers still read at feed size.
    stats: [
      { value: '6,000+', label: 'servers' },
      { value: '240,000+', label: 'members reached' },
      { value: '70%', label: 'finished a dub' },
    ],
  },
} satisfies CaseStudy;
