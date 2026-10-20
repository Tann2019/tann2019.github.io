// The theme sky.ts writes onto :root, kept for the session. scene.ts saves it after every live paint, and
// RestoreTheme.astro puts it back before first paint, so a page opened from another starts in that page's colours
// instead of flashing the defaults. No DOM work at import time: the pages read these on the server.

export const THEME_KEY = 'bigsky-theme-v1';

/** The custom properties applyTheme (sky.ts) writes, in its order. */
export const THEME_VARS = [
  '--bg', '--bg-rgb', '--fg', '--fg-rgb', '--muted', '--accent', '--accent-rgb', '--line',
  '--c0', '--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7',
] as const;

export type ThemeVar = (typeof THEME_VARS)[number];

/** What RestoreTheme.astro may put back: the theme, plus the sky behind it, which the CSS reads as a fallback. */
export const RESTORED_VARS = [...THEME_VARS, '--sky', '--sky-night'];

export function saveTheme() {
  const root = document.documentElement.style;
  const theme: Record<string, string> = {};
  for (const name of THEME_VARS) theme[name] = root.getPropertyValue(name);
  // The sky too, so the page behind the restored colours matches them.
  theme['--sky'] = document.getElementById('sky')?.style.backgroundImage ?? '';
  theme['--sky-night'] = document.getElementById('sky-base')?.style.opacity ?? '';
  theme.color = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '';
  try {
    sessionStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // Storage can be blocked; the next page starts from the defaults instead.
  }
}
