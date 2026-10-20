import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

/** Names for the code labels, where the fence's own word, capitalised, isn't one. */
const LANGUAGES = {
  bash: 'Shell', cpp: 'C++', css: 'CSS', html: 'HTML', ini: 'INI', javascript: 'JavaScript', js: 'JavaScript',
  json: 'JSON', jsx: 'JSX', md: 'Markdown', php: 'PHP', sh: 'Shell', shell: 'Shell', sql: 'SQL', ts: 'TypeScript',
  tsx: 'TSX', typescript: 'TypeScript', yaml: 'YAML', yml: 'YAML', zsh: 'Shell',
};

/** A fence's language as its label says it, or '' for none. */
const languageName = (lang) =>
  !lang || ['plaintext', 'text', 'txt'].includes(lang) ? '' : LANGUAGES[lang] ?? lang[0].toUpperCase() + lang.slice(1);

/**
 * A post's code block that names its language gets a label over it, in a wrapper: the block scrolls sideways, and a
 * label inside it would scroll away. See .code in src/redesign/css/article.css. Every block is a named region and a
 * data-scroller, so article.ts gives it a tab stop only while it has something to scroll, as on the case studies.
 */
const codeLabel = {
  name: 'code-label',
  pre(node) {
    Object.assign(node.properties, { role: 'region', 'aria-label': languageName(this.options.lang) || 'Code', 'data-scroller': '' });
  },
  root(root) {
    const name = languageName(this.options.lang);
    if (!name) return;
    const label = { type: 'element', tagName: 'span', properties: { className: ['code-lang'] }, children: [{ type: 'text', value: name }] };
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
