// The case studies under /work/, in the order the homepage lists them. Each one's facts live in its own file
// and feed the homepage window, the share card and the page itself, so a number changes in one place.
import type { ImageMetadata } from 'astro';
import { disdubs } from './disdubs';
import { gridiron } from './gridiron';

export interface Stat {
  value: string;
  label: string;
}

/** A share card's moment: minutes past midnight, Billings time, on og.ts's reference day, and cloud cover 0-100. */
export interface CardScene {
  minutes: number;
  /** The way Open-Meteo reports it. */
  cloud: number;
}

export interface CaseStudy {
  /** Its page is /work/<slug>/ and its share card public/og/<slug>.png. The terminal opens and lists it by this. */
  slug: string;
  href: string;
  /** The homepage window that sums it up (APPS in src/redesign/windows.ts), and the FileIcon of its desktop icon,
   * launcher entry and bar chip. */
  app: string;
  icon: string;
  title: string;
  /** Its line in the desktop's launcher. */
  launcher: string;
  /** The product's own site. */
  site: { href: string; name: string };
  /** A companion post, when there is one. */
  essay?: string;
  /** ISO 8601 with the Billings offset. */
  published?: string;
  modified?: string;
  /**
   * The page's own hero line, meta and headline numbers. A stat's `short` is its label for the homepage window,
   * worded to stand without the note.
   */
  lede: string;
  meta: { label: string; value: string }[];
  stats: (Stat & { note?: string; short?: string })[];
  /** DisDubs: how a dub gets made, one screen per step. The images are masters under src/assets/. */
  reel?: { title: string; img: ImageMetadata; alt: string; line: string }[];
  /** The stack, one row per position, as KeyRows takes it. */
  stack?: { key: string; value: string }[];
  /** The homepage window's shorter copy. */
  window: { lede: string; meta: string; stats?: Stat[] };
  /** The share card and its time of day. Any change here needs `npm run og` for a new card. */
  card: { lede: string; stats: Stat[]; scene: CardScene };
}

export const caseStudies: CaseStudy[] = [disdubs, gridiron];

/** The case studies either side of this one in caseStudies, for its PrevNext. */
export function neighbours(slug: string) {
  const i = caseStudies.findIndex((s) => s.slug === slug);
  if (i === -1) throw new Error(`neighbours: no case study ${slug}`);
  const link = (s: CaseStudy | undefined) => s && { href: s.href, title: s.title };
  return { prev: link(caseStudies[i - 1]), next: link(caseStudies[i + 1]) };
}
