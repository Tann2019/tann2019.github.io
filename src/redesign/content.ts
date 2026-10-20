// Mockup copy of the data that lives inline in src/pages/index.astro today.
// Phase 1 moves these into src/data/ so the desktop and the plain pages share one source.
import { caseStudies } from '../data/case-studies';

export const experience = [
  {
    role: 'Support Engineer',
    company: 'Givebutter',
    location: 'Remote',
    period: 'Oct 2025 – Present',
    bullets: [
      'Feature work, maintenance and reliability fixes across a global nonprofit CRM and fundraising platform.',
      'Triage and escalate platform incidents, with a focus on fast root cause and clear communication.',
      'Build internal tools and automation that cut ticket volume and response times.',
    ],
  },
  {
    role: 'Programmer',
    company: 'Computers Unlimited',
    location: 'Billings, MT',
    period: 'Jun 2024 – Oct 2025',
    bullets: [
      'Built and maintained an enterprise mobile app that runs alongside an ERP on more than 8,000 devices.',
    ],
  },
  {
    role: 'Software Engineer',
    company: 'Software Design Associates',
    location: 'Billings, MT',
    period: 'Jan 2022 – Jun 2024',
    bullets: [
      'Core contributor to the Fence Cloud suite, used by more than 600 clients.',
      'Built Zapier middleware that brought authentication and REST standards to the platform.',
      'Helped launch Fence Cloud on Microsoft Azure.',
    ],
  },
];

export const toolkit = [
  { group: 'Backend', items: ['Laravel', 'PHP', 'PostgreSQL', 'MySQL', 'Redis', 'WebSockets', 'Stripe'] },
  { group: 'Frontend', items: ['React', 'Inertia.js', 'Tailwind CSS', 'Framer Motion', 'Alpine.js'] },
  { group: 'Mobile', items: ['Expo', 'React Native', 'NativeWind', 'Zustand'] },
  { group: 'Tooling', items: ['Vite', 'Azure DevOps', 'GitHub Actions', 'PHPStan', 'Laravel Pint'] },
];

export const sideProjects = [
  { name: 'HourCrew', what: 'Take a photo every hour with your crew. Expo app and Next.js backend in one Turborepo.', stack: 'Expo, Next.js, PostgreSQL, S3' },
  { name: 'Mort', what: 'A local-first AI assistant over Telegram that can spawn Claude Code to open PRs across repos.', stack: 'Telegram, Groq, Claude, Raspberry Pi' },
  { name: 'Twitch Codes', what: 'A VS Code extension that lets Twitch chat highlight lines, suggest edits and vote on them.', stack: 'JavaScript, VS Code API', href: 'https://github.com/Tann2019/twitch-codes' },
  { name: 'Montarev', what: 'Two-way sync between Notion tasks and Discord threads.', stack: 'Node.js, Notion API, discord.js' },
  { name: 'HyGambling', what: 'A server-side casino plugin for Hytale: loot boxes, slots, roulette, per-player balances.', stack: 'Java' },
  { name: 'Tech News Gram', what: 'Turns tech headlines into narrated, subtitled short videos and uploads them.', stack: 'Python, ElevenLabs, Whisper, FFmpeg', href: 'https://github.com/Tann2019/tech-news-gram' },
  { name: 'Zed Blade Support', what: 'Laravel Blade syntax highlighting for the Zed editor.', stack: 'tree-sitter', href: 'https://github.com/Tann2019/zed-blade-support' },
  { name: 'Gundam TCG Deck Builder', what: 'Card search and deck building for the Gundam trading card game.', stack: 'Laravel, Livewire, MongoDB', href: 'https://github.com/Tann2019/Gundam' },
];

/** Icons on the desktop, top to bottom from the right edge. `app` is the window each one opens. */
export const desktopIcons = [
  ...caseStudies.map((s) => ({ name: s.slug, icon: s.icon, app: s.app, label: `${s.title} case study` })),
  { name: 'mothership', icon: 'd20', app: 'mothership', label: 'DnD Mothership' },
  { name: 'work-history.txt', icon: 'clipboard', app: 'work', label: 'Work history' },
  { name: 'side-projects', icon: 'tacklebox', app: 'side', label: 'Side projects' },
  { name: 'writing', icon: 'notebook', app: 'writing', label: 'Writing' },
  { name: 'chess', icon: 'knight', app: 'chess', label: 'Chess against Mort' },
  { name: 'synth', icon: 'synth', app: 'synth', label: 'Synth' },
  { name: 'sticky-notes', icon: 'stickynote', app: 'guestbook', label: 'Sticky notes' },
  { name: 'lofi-radio', icon: 'vinyl', app: 'radio', label: 'Lofi radio' },
  { name: 'say-hi', icon: 'mailbox', app: 'sayhi', label: 'Say hi' },
  { name: 'terminal', icon: 'terminal', app: 'terminal', label: 'Terminal' },
] as const;
