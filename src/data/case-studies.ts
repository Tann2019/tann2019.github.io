// The case studies under /work/, in the order the homepage lists them. Each one's facts live in its own file
// and feed the homepage window, the share card and the page itself, so a number changes in one place.
import type { ImageMetadata } from 'astro';
import { disdubs } from './disdubs';
import { gridiron } from './gridiron';

export interface Stat {
  value: string;
  label: string;
}

export interface CaseStudy {
  /** Its page is /work/<slug>/ and its share card public/og/<slug>.png. */
  slug: string;
  href: string;
  /** The homepage window that sums it up (APPS in src/redesign/wm.ts), and that window's FileIcon. */
  app: string;
  icon: string;
  title: string;
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
  /** The stack, one row per position. */
  stack?: { pos: string; item: string }[];
  /** The homepage window's shorter copy. */
  window: { lede: string; meta: string; stats?: Stat[] };
  /** The share card. Any change here needs `npm run og` for a new card. */
  card: { lede: string; stats: Stat[] };
}

export const caseStudies: CaseStudy[] = [disdubs, gridiron];
