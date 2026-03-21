import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://tann2019.github.io',
  integrations: [mdx()],
});
