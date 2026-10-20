// The blog, as the desktop's writing window, /blog/ and the posts list it.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Newest first. */
export async function getPosts(): Promise<Post[]> {
  return (await getCollection('blog')).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** "April 1, 2026". In UTC: a pubDate is a plain day, which a Mountain time build would print as the day before. */
export const postDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The post's own name for crumbs and the bar chip: its title up to the first dash. */
export const shortTitle = (post: Post) => post.data.title.split(/ [—–-] /)[0];
