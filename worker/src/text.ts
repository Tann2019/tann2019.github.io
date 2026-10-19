// Text hygiene shared by notes and cursor labels: strip invisible characters, cap length, block words.

/** Control characters, soft hyphens, zero-width marks and bidi overrides. Newlines are handled separately. */
const INVISIBLE: [number, number][] = [
  [0x00, 0x09], [0x0b, 0x1f], [0x7f, 0x9f], [0xad, 0xad],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff],
];

function stripInvisible(s: string) {
  return Array.from(s).filter((ch) => {
    const cp = ch.codePointAt(0)!;
    return !INVISIBLE.some(([a, b]) => cp >= a && cp <= b);
  }).join('');
}

/**
 * Clean a user-supplied field. Missing values become ''. Returns null when the value isn't a
 * string or is still longer than `max` characters after cleaning, so callers can reject it.
 */
export function cleanText(value: unknown, max: number, multiline = false): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  let s = value.normalize('NFC').replace(/\r\n?/g, '\n');
  s = multiline ? s.replace(/\t/g, ' ') : s.replace(/\s+/g, ' ');
  s = stripInvisible(s);
  // A sticky note has room for a line break or two, not a poem's worth of blank lines.
  if (multiline) s = s.replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  return [...s].length > max ? null : s;
}

// A short default list. Stronger terms belong in the BLOCKLIST secret, so they stay out of the repo.
// A trailing * matches any word that starts with the stem.
const DEFAULT_BLOCKED = [
  'fuck*', 'shit*', 'cunt*', 'bitch*', 'whore*', 'slut*', 'nigg*', 'fag', 'faggot*', 'retard*',
  'rape', 'rapist*', 'porn*', 'onlyfans', 'viagra', 'cialis', 'casino*',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

/** Lowercase, drop accents and undo the usual digit-for-letter swaps. */
function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[013457@$]/g, (c) => LEET[c]);
}

let cached: { extra: string; test: (text: string) => boolean } | null = null;

/** True if any word in `text` is on the blocklist. */
export function isBlocked(text: string, extra = ''): boolean {
  if (!text) return false;
  if (cached?.extra !== extra) {
    const entries = [...DEFAULT_BLOCKED, ...extra.split(',')].map((w) => fold(w.trim())).filter(Boolean);
    const exact = new Set(entries.filter((w) => !w.endsWith('*')));
    const stems = entries.filter((w) => w.endsWith('*')).map((w) => w.slice(0, -1));
    cached = {
      extra,
      test: (t) => fold(t).split(/[^a-z]+/).some((word) => !!word && (exact.has(word) || stems.some((stem) => word.startsWith(stem)))),
    };
  }
  return cached.test(text);
}

/** Links are the spam vector on every guestbook ever made. */
export function hasLink(text: string) {
  return /(https?:\/\/|www\.)/i.test(text);
}
