// The scene under every Big Sky page, painted for one moment. Shared by the desktop (main.ts) and the
// share cards (og.ts), so they can't drift apart.
import { applyTheme, paintSky, skyColorsAt, type SkySnapshot } from './sky';
import { paintLand } from './land';
import { lightWeather } from './weather';

/** Paint the sky for `date`, theme the page from its inks, then light the land and clouds to match. */
export function paintScene(svg: SVGSVGElement, date: Date): SkySnapshot {
  const snap = paintSky(svg, date);
  const sky = { alt: snap.alt, ...skyColorsAt(snap.alt) };
  applyTheme(snap.inks, sky);
  paintLand(sky);
  lightWeather(sky);
  return snap;
}
