// The blog, as the desktop's writing window, /blog/ and the posts list it.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Newest first. Same-day posts by id, so older/newer links don't depend on the order the loader reads files in. */
export async function getPosts(): Promise<Post[]> {
  return (await getCollection('blog')).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf() || a.id.localeCompare(b.id),
  );
}

/** "April 1, 2026". In UTC: a pubDate is a plain day, which a Mountain time build would print as the day before. */
export const postDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "2026-04-01", for a <time datetime>. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The post's own name for crumbs and the bar chip: its `short` frontmatter, else its title up to the first dash. */
export const shortTitle = (post: Post) => post.data.short ?? post.data.title.split(/ [—–-] /)[0];

/** Text set in National Park, which draws a capital I like an l: "GridIron" would read "Gridlron". Display only
 *  (the page and the share cards): <title>, og and JSON-LD keep the real name. */
export const fixGridIron = (s: string) => s.replace(/\bGridIron\b/g, 'Gridiron');

/** The title as set in National Park (see fixGridIron), with the space before a dash made unbreakable, since its
 *  balanced wrap could otherwise start a line with the dash. */
export const displayTitle = (post: Post) =>
  fixGridIron(post.data.title).replace(/ ([—–-]) /, ' $1 ');
