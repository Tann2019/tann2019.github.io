import { open, lock } from './wm';
import { formatDay, formatTime, nextSunLine, phaseName, sunPosition } from './sky';

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Names the terminal accepts for `open`, mapped to window ids. The case studies are added in mountTerminal. */
const OPENABLE: Record<string, string> = {
  mothership: 'mothership',
  chess: 'chess',
  writing: 'writing',
  blog: 'writing',
  work: 'work',
  'work-history': 'work',
  'work-history.txt': 'work',
  'side-projects': 'side',
  side: 'side',
  'say-hi': 'sayhi',
  mail: 'sayhi',
  radio: 'radio',
  lofi: 'radio',
  'lofi-radio': 'radio',
  music: 'radio',
  synth: 'synth',
  guestbook: 'guestbook',
  notes: 'guestbook',
  'sticky-notes': 'guestbook',
};

const LS = ['mothership/', 'side-projects/', 'writing/', 'chess', 'synth', 'sticky-notes', 'lofi-radio', 'say-hi', 'about.txt', 'work-history.txt'];

/** about.txt. The job comes from the work history by way of index.astro (data-job), like the neofetch's Role. */
const about = (job: string) => [
  'Full-stack developer in Billings, Montana. Laravel and React, with',
  'real-time features wherever they earn their keep. B.S. in Computer',
  `Science from Rocky Mountain College. ${job}.`,
];

export function mountTerminal(root: HTMLElement) {
  const out = root.querySelector<HTMLElement>('.term-out')!;
  const form = root.querySelector<HTMLFormElement>('.term-form')!;
  const input = root.querySelector<HTMLInputElement>('.term-input')!;
  const neofetch = document.querySelector<HTMLTemplateElement>('#tpl-neofetch')!;
  // Each case study as [slug, window id], from src/data/ by way of index.astro, so a new one opens and lists here too.
  const studies: [string, string][] = JSON.parse(root.dataset.studies ?? '[]');
  const openable: Record<string, string> = {
    ...Object.fromEntries(studies.flatMap(([slug, app]): [string, string][] => [[slug, app], [app, app]])),
    ...OPENABLE,
  };
  const ls = [...studies.map(([slug]) => `${slug}/`), ...LS];
  const history: string[] = [];
  let cursor = 0;

  function print(html: string, className = '') {
    const p = document.createElement('div');
    p.className = `term-line ${className}`.trim();
    p.innerHTML = html;
    out.append(p);
  }

  const commands: Record<string, (args: string[]) => void> = {
    help() {
      print(
        [
          ['ls', 'list what’s in ~'],
          ['open &lt;name&gt;', 'open an app, e.g. <b>open chess</b>'],
          ['cat about.txt', 'a few lines about me'],
          ['neofetch', 'system info, with the current palette'],
          ['sky', 'the sun over Billings right now'],
          ['whoami', 'who you’re talking to'],
          ['date', 'the time in Billings'],
          ['lock', 'lock the screen'],
          ['clear', 'clear the terminal'],
        ]
          .map(([c, d]) => `<span class="t-cmd">${c}</span><span class="t-dim">${d}</span>`)
          .join(''),
        'term-help',
      );
    },
    ls() {
      print(ls.map((f) => `<span class="${f.endsWith('/') ? 't-dir' : ''}">${f}</span>`).join('  '));
    },
    cat(args) {
      const file = args[0];
      if (file === 'about.txt') return print(about(root.dataset.job ?? '').map(escape).join('<br>'));
      if (file === 'work-history.txt') {
        open('work');
        return print('Opened work history.');
      }
      print(file ? `cat: ${escape(file)}: no such file. Try <b>ls</b>.` : 'cat: name a file, e.g. <b>cat about.txt</b>');
    },
    open(args) {
      const name = (args[0] ?? '').replace(/\/$/, '').toLowerCase();
      const id = Object.hasOwn(openable, name) ? openable[name] : undefined;
      if (!id) {
        print(name ? `open: nothing called ${escape(name)}. Try <b>ls</b>.` : 'open: name something, e.g. <b>open chess</b>');
        return;
      }
      open(id);
    },
    chess() {
      open('chess');
    },
    neofetch() {
      out.append(neofetch.content.cloneNode(true));
    },
    sky() {
      const now = new Date();
      const sun = sunPosition(now);
      print(
        `${phaseName(sun.alt, now)} in Billings. The sun is ${sun.alt.toFixed(1)}° ` +
          `${sun.alt >= 0 ? 'above' : 'below'} the horizon. ${nextSunLine(now)}.`,
      );
    },
    whoami() {
      print('tanner');
    },
    date() {
      const now = new Date();
      print(`${formatDay(now)}, ${formatTime(now)} in Billings, Montana`);
    },
    lock() {
      lock();
    },
    clear() {
      out.innerHTML = '';
    },
    sudo() {
      print('Permission denied. It’s a portfolio.');
    },
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    input.value = '';
    print(`<span class="term-prompt">tanner@billings <b>~</b> $</span> ${escape(raw)}`);
    if (raw) {
      history.push(raw);
      cursor = history.length;
      const [cmd, ...args] = raw.split(/\s+/);
      const key = cmd.toLowerCase();
      // hasOwn, so `__proto__` or `toString` is just an unknown command.
      const run = Object.hasOwn(commands, key) ? commands[key] : undefined;
      if (run) run(args);
      else print(`${escape(cmd)}: command not found. Type <b>help</b> to see what’s here.`);
    }
    root.scrollTop = root.scrollHeight;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && cursor > 0) {
      e.preventDefault();
      input.value = history[--cursor];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(history.length, cursor + 1);
      input.value = history[cursor] ?? '';
    }
  });

  // Clicking anywhere in the terminal puts the cursor on the prompt, unless you're selecting text.
  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a, button') || getSelection()?.toString()) return;
    input.focus({ preventScroll: true });
  });
}
