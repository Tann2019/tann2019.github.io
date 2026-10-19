import {
  applyTheme,
  billingsDateAt,
  billingsMinutes,
  fetchWeather,
  formatDay,
  formatShortDay,
  formatTime,
  nextSunLine,
  paintSky,
  phaseName,
  skyColorsAt,
  sunPosition,
  type Weather,
} from './sky';
import { setupWindowManager } from './wm';
import { setupDesktop } from './desktop';
import { paintLand, setupLand } from './land';
import { forcedWeather, lightWeather, setWeather, setupWeather } from './weather';
import { mountTerminal } from './terminal';
import { mountChess } from './chess/board';
import { mountRadio } from './radio';
import { mountSynth } from './apps/synth';
import { mountGuestbook } from './apps/guestbook';
import { mountCursors } from './apps/cursors';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const wallpaper = document.querySelector<SVGSVGElement>('#wallpaper')!;
const scrub = $<HTMLInputElement>('#sky-scrub');
const liveBtn = $<HTMLButtonElement>('#sky-live');

/** Minutes past midnight being previewed, or null for live. */
let preview: number | null = null;
let weather: Weather | null = null;

const FIRST_JOB = new Date(2022, 0, 1);

function uptime(now: Date): string {
  const months = (now.getFullYear() - FIRST_JOB.getFullYear()) * 12 + now.getMonth() - FIRST_JOB.getMonth();
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} years${m ? `, ${m} month${m === 1 ? '' : 's'}` : ''} shipping`;
}

function splitTime(d: Date) {
  const [time, ampm] = formatTime(d).split(' ');
  return { time, ampm };
}

function setText(sel: string, text: string) {
  document.querySelectorAll<HTMLElement>(sel).forEach((el) => (el.textContent = text));
}

function refresh() {
  const now = new Date();
  const shown = preview === null ? now : billingsDateAt(preview, now);
  const snap = paintSky(wallpaper, shown);
  const sky = { alt: snap.alt, ...skyColorsAt(snap.alt) };
  applyTheme(snap.inks, sky);
  paintLand(sky);
  lightWeather(sky);

  // Home: the conky block on the wallpaper follows whatever sky is showing.
  const t = splitTime(shown);
  setText('#conky-time', t.time);
  setText('#conky-ampm', t.ampm);
  setText('#conky-day', preview === null ? `${formatDay(now)} in Billings` : 'Preview, not live');
  setText('#conky-phase', snap.phase);
  setText('#conky-sun', nextSunLine(shown));
  if (preview === null) scrub.value = String(billingsMinutes(now));
  scrub.setAttribute('aria-valuetext', `${formatTime(shown)}, ${snap.phase.toLowerCase()}`);

  // The bar and the lock screen always tell the real time.
  const live = splitTime(now);
  setText('#bar-clock', `${formatShortDay(now)}  ${formatTime(now)}`);
  setText('#lock-time', live.time);
  setText('#lock-ampm', live.ampm);
  setText('#lock-day', formatDay(now));
  const livePhase = preview === null ? snap.phase : phaseName(sunPosition(now).alt, now);
  setText('#lock-phase', `${livePhase} in Billings, Montana`);
  setText('#bar-sun-text', nextSunLine(now));
  setText('[data-live="sky"]', `${livePhase}, ${nextSunLine(now).toLowerCase()}`);
  setText('[data-live="uptime"]', uptime(now));
}

/** The scrubber's track is the day itself: the sky band color at every hour, left to right. */
function paintScrubTrack() {
  const now = new Date();
  const stops: string[] = [];
  for (let h = 0; h <= 24; h++) {
    const alt = sunPosition(billingsDateAt(Math.min(h * 60, 1439), now)).alt;
    stops.push(`${skyColorsAt(alt).mid} ${((h / 24) * 100).toFixed(2)}%`);
  }
  scrub.style.setProperty('--track', `linear-gradient(90deg, ${stops.join(', ')})`);
}

function showWeather(w: Weather | null) {
  weather = w;
  const bar = $('#bar-weather');
  const conky = $('#conky-weather');
  if (!weather) return;
  if (!forcedWeather()) setWeather(weather);
  bar.textContent = `${weather.temp}° ${weather.label}`;
  bar.hidden = false;
  conky.textContent = ` ${weather.temp}°F and ${weather.label.toLowerCase()}.`;
}

function setupScrubber() {
  scrub.addEventListener('input', () => {
    preview = Number(scrub.value);
    liveBtn.hidden = false;
    document.body.classList.add('is-previewing');
    refresh();
  });
  liveBtn.addEventListener('click', () => {
    preview = null;
    liveBtn.hidden = true;
    document.body.classList.remove('is-previewing');
    refresh();
    scrub.focus();
  });
}

function setupCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    const label = btn.textContent;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy!);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Press Ctrl+C to copy';
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('.hi-addr')!);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
      window.setTimeout(() => (btn.textContent = label), 2000);
    });
  });
}

function fitWallpaper() {
  // Phones are tall and narrow: frame the peaks, the city and the end of the Rims instead of the middle.
  const compact = matchMedia('(max-width: 760px)').matches;
  wallpaper.setAttribute('viewBox', compact ? '180 0 760 1000' : '0 0 1600 1000');
}

setupLand($<HTMLCanvasElement>('#land'));
setupWeather($<HTMLCanvasElement>('#clouds'), $<HTMLCanvasElement>('#precip'));
const forced = forcedWeather();
if (forced) setWeather(forced);
paintScrubTrack();
fitWallpaper();
refresh();
setupDesktop();
setupWindowManager();
setupScrubber();
setupCopy();
mountTerminal($('.term'));
mountChess($('.cb'));
mountRadio($('.radio'));
mountSynth($('.synth'));
mountGuestbook($('.gb'));
mountCursors();
fetchWeather().then(showWeather);

window.setInterval(refresh, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
matchMedia('(max-width: 760px)').addEventListener('change', fitWallpaper);
// The sun's arc depends on how much sky the window shows.
let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(refresh);
});
document.documentElement.classList.add('is-ready');
