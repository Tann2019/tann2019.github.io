import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { caseStudies } from '../data/case-studies';

const SITE = 'https://tannersteorts.com';

/** Static routes, with the weight I want search engines to read them at. A case study's lastmod is its modified date. */
const staticPages: { path: string; priority: string; changefreq: string; date?: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'monthly' },
  { path: '/about/', priority: '0.7', changefreq: 'yearly' },
  { path: '/blog/', priority: '0.7', changefreq: 'weekly' },
  ...caseStudies.map((s) => ({ path: s.href, priority: '0.9', changefreq: 'monthly', date: s.modified ?? s.published })),
];

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');

  const urls = [
    ...staticPages.map((p) => ({
      loc: `${SITE}${p.path}`,
      lastmod: p.date && new Date(p.date).toISOString(),
      priority: p.priority,
      changefreq: p.changefreq,
    })),
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
