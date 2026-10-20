import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { caseStudies } from '../data/case-studies';

const SITE = 'https://tannersteorts.com';

/** Static routes, with the weight I want search engines to read them at. */
const staticPages: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'monthly' },
  { path: '/about/', priority: '0.7', changefreq: 'yearly' },
  { path: '/blog/', priority: '0.7', changefreq: 'weekly' },
  { path: '/work/disdubs/', priority: '0.9', changefreq: 'monthly' },
  { path: '/work/gridiron-duels/', priority: '0.9', changefreq: 'monthly' },
];

/** A case study's lastmod is the modified date in its data module. */
const modified = new Map(caseStudies.map((s) => [s.href, s.modified ?? s.published]));

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');

  const urls = [
    ...staticPages.map((p) => {
      const date = modified.get(p.path);
      return {
        loc: `${SITE}${p.path}`,
        lastmod: date && new Date(date).toISOString(),
        priority: p.priority,
        changefreq: p.changefreq,
      };
    }),
    ...posts.map((post) => ({
      loc: `${SITE}/blog/${post.id}/`,
      lastmod: (post.data.updatedDate ?? post.data.pubDate).toISOString(),
      priority: '0.6',
      changefreq: 'yearly',
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
