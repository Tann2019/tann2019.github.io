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

/** The title as set in National Park, which draws a capital I like an l ("GridIron" would read "Gridlron"), and
 *  whose balanced wrap could start a line with the dash. Display only: <title>, og and JSON-LD keep the real title. */
export const displayTitle = (post: Post) =>
  post.data.title.replace(/\bGridIron\b/g, 'Gridiron').replace(/ ([—–-]) /, ' $1 ');
