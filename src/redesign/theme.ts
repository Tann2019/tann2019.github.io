// The theme sky.ts writes onto :root, kept for the session. scene.ts saves it after every live paint, and ArticleLayout's
// head script puts it back before first paint, so a page opened from the desktop starts in the desktop's colours
// instead of flashing the day defaults. No DOM work at import time: ArticleLayout reads the key on the server.

export const THEME_KEY = 'bigsky-theme-v1';

const VARS = ['--bg', '--bg-rgb', '--fg', '--fg-rgb', '--muted', '--accent', '--accent-rgb', '--line'];
for (let i = 0; i < 8; i++) VARS.push(`--c${i}`);

export function saveTheme() {
  const root = document.documentElement.style;
  const theme: Record<string, string> = {};
  for (const name of VARS) theme[name] = root.getPropertyValue(name);
  // The sky too, so the page behind the restored colours matches them. article.css reads these two.
  theme['--sky'] = document.getElementById('sky')?.style.backgroundImage ?? '';
  theme['--sky-night'] = document.getElementById('sky-base')?.style.opacity ?? '';
  theme.color = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '';
  try {
    sessionStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // Storage can be blocked; the next page starts from the defaults instead.
  }
}
