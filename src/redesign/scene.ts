// The scene under every Big Sky page, painted for one moment. Shared by the desktop (main.ts), the case studies
// (article.ts) and the share cards (og.ts), so they can't drift apart.
import { applyTheme, paintSky, skyColorsAt, type SkySnapshot } from './sky';
import { paintLand, type LandLight } from './land';
import { saveTheme } from './theme';

/**
 * Paint the sky for `date`, theme the page from its inks, then light the land to match. `light` relights layers only
 * some pages have: the desktop and the share cards pass lightWeather for their clouds. Leaving it out keeps
 * weather.ts out of the articles' bundle.
 */
export function paintScene(svg: SVGSVGElement, date: Date, light?: (sky: LandLight) => void): SkySnapshot {
  const snap = paintSky(svg, date);
  const sky = { alt: snap.alt, ...skyColorsAt(snap.alt) };
  applyTheme(snap.inks, sky);
  paintLand(sky);
  light?.(sky);
  saveTheme();
  return snap;
}

/** Phones are tall and narrow: frame the peaks, the city and the end of the Rims instead of the middle. */
export function fitWallpaper(svg: SVGSVGElement) {
  const compact = matchMedia('(max-width: 760px)').matches;
  svg.setAttribute('viewBox', compact ? '180 0 760 1000' : '0 0 1600 1000');
}
