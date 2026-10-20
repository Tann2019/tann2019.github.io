import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

/** Names for the code labels, where the fence's own word isn't one. */
const LANGUAGES = { cpp: 'C++', ini: 'INI', js: 'JavaScript', json: 'JSON', php: 'PHP', sh: 'Shell', ts: 'TypeScript' };

/**
 * A post's code block that names its language gets a label over it, in a wrapper: the block scrolls sideways, and a
 * label inside it would scroll away. See .code in src/redesign/css/article.css.
 */
const codeLabel = {
  name: 'code-label',
  root(root) {
    const lang = this.options.lang;
    if (!lang || ['plaintext', 'text', 'txt'].includes(lang)) return;
    const label = { type: 'element', tagName: 'span', properties: { className: ['code-lang'] }, children: [{ type: 'text', value: LANGUAGES[lang] ?? lang }] };
    root.children = [{ type: 'element', tagName: 'div', properties: { className: ['code'] }, children: [label, ...root.children] }];
  },
};

export default defineConfig({
  site: 'https://tannersteorts.com',
  integrations: [mdx()],
  markdown: {
    // css-variables, so a post's code takes its colors from the live sky theme like the rest of the page.
    shikiConfig: { theme: 'css-variables', transformers: [codeLabel] },
  },
});
