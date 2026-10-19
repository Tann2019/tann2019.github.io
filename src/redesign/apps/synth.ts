// A pocket synth. An XY pad: across picks a note from the scale, up opens the filter.
// Fingers, the mouse and the home row each play a voice, up to four, through an echo and a soft limiter.

type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';
type ScaleId = 'major' | 'minor' | 'dorian';

/** Semitones above the root. Every scale starts on C, so switching changes the mood, not the key. */
const SCALES: Record<ScaleId, number[]> = {
  major: [0, 2, 4, 7, 9],
  minor: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};
const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** The home row plays the pad's first nine notes, left to right. */
const KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'];
const KEY_LABELS = 'ASDFGHJKL';

const MAX_VOICES = 4;
/** Octaves across the pad. One more column on the right lands back on the root. */
const SPAN = 2;
const MIN_OCTAVE = 2;
const MAX_OCTAVE = 5;
/** Envelope time constants, in seconds: short enough to feel instant, long enough not to click. */
const ATTACK = 0.004;
const RELEASE = 0.06;
const STEAL = 0.005;
/** Two oscillators a few cents apart sound wider than one. */
const DETUNE = [-5, 5];
/** Voice level per waveform. Saw and square carry far more energy than a sine at the same amplitude. */
const LEVEL: Record<Wave, number> = { sine: 0.3, triangle: 0.28, sawtooth: 0.15, square: 0.12 };
const ECHO_TIME = 0.32;
const ECHO_FEEDBACK = 0.42;
/** Where keyboard notes sit on the pad's brightness axis until the arrows move them. */
const KEY_Y = 0.35;
const TRAIL_MS = 900;
const RIPPLE_MS = 520;
const TAU = Math.PI * 2;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface Engine {
  ctx: AudioContext;
  /** Every voice sums here, then splits to the master and the echo send. */
  bus: GainNode;
  send: GainNode;
  master: GainNode;
}

interface Pt {
  x: number;
  y: number;
  t: number;
}

interface Trail {
  pts: Pt[];
  /** Still attached to a sounding voice. Dead trails fade out and are dropped. */
  live: boolean;
}

interface Voice {
  oscs: OscillatorNode[];
  filter: BiquadFilterNode;
  amp: GainNode;
  /** Column on the pad, which is the note. */
  step: number;
  /** Pad position, 0 to 1 from the top left. */
  x: number;
  y: number;
  /** Home-row key that started it, if any. */
  key: number | null;
  /** Finger or key still down. Held voices ring on after this goes false, until Hold and Shift let go. */
  down: boolean;
  ending: boolean;
  trail: Trail;
}

/** oscillators -> lowpass -> envelope -> bus -> master -> limiter, with the bus also feeding a dark echo. */
function createEngine(volume: number, echo: number): Engine {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -8, knee: 6, ratio: 16, attack: 0.003, release: 0.2 });
  const master = new GainNode(ctx, { gain: volume });
  const bus = new GainNode(ctx);
  const send = new GainNode(ctx, { gain: echo });
  const delay = new DelayNode(ctx, { delayTime: ECHO_TIME, maxDelayTime: 1 });
  const feedback = new GainNode(ctx, { gain: ECHO_FEEDBACK });
  // Each repeat passes the lowpass again, so the echo gets darker as it fades.
  const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2400 });
  bus.connect(master);
  bus.connect(send).connect(delay).connect(tone).connect(feedback).connect(delay);
  tone.connect(master);
  master.connect(limiter).connect(ctx.destination);
  return { ctx, bus, send, master };
}

export function mountSynth(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const win = root.closest<HTMLElement>('.win') ?? root;
  const pad = $('.synth-pad');
  const canvas = $<HTMLCanvasElement>('.synth-canvas');
  const g = canvas.getContext('2d')!;
  const scaleSel = $<HTMLSelectElement>('[data-synth="scale"]');
  const octOut = $<HTMLOutputElement>('[data-synth="octave"]');
  const octDown = $<HTMLButtonElement>('[data-synth="oct-down"]');
  const octUp = $<HTMLButtonElement>('[data-synth="oct-up"]');
  const glideIn = $<HTMLInputElement>('[data-synth="glide"]');
  const echoIn = $<HTMLInputElement>('[data-synth="echo"]');
  const volIn = $<HTMLInputElement>('[data-synth="volume"]');
  const holdBtn = $<HTMLButtonElement>('[data-synth="hold"]');
  const waveIns = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="synth-wave"]'));

  // The markup holds the defaults. The sliders fill in glide, echo and volume when they bind below.
  const settings = {
    wave: (waveIns.find((i) => i.checked)?.value ?? 'sawtooth') as Wave,
    scale: scaleSel.value as ScaleId,
    octave: Number(octOut.value) || 3,
    glide: 0,
    echo: 0,
    volume: 0,
  };

  let engine: Engine | null = null;
  let suspendTimer = 0;
  const voices: Voice[] = [];
  const pointers = new Map<number, Voice>();
  const keys = new Map<number, Voice>();
  let hold = false;
  let shift = false;
  let keyY = KEY_Y;

  const trails = new Set<Trail>();
  const ripples: Pt[] = [];
  let ink = { accent: '128, 128, 128', fg: '128, 128, 128', mono: 'monospace' };
  let cssW = 0;
  let cssH = 0;
  let raf = 0;

  // ---------------------------------------------------------------- pitch

  const scale = () => SCALES[settings.scale];
  const columns = () => scale().length * SPAN + 1;
  const stepAt = (x: number) => Math.min(columns() - 1, Math.floor(x * columns()));
  const echoSend = () => settings.echo * 0.8;

  function freqOf(step: number) {
    const s = scale();
    const midi = 12 * (settings.octave + 1) + s[step % s.length] + 12 * Math.floor(step / s.length);
    return 440 * 2 ** ((midi - 69) / 12);
  }

  const noteName = (step: number) => NOTE_NAMES[scale()[step % scale().length]];

  /** The filter tracks the note: the bottom of the pad sits on the fundamental, the top lets every harmonic in. */
  const cutoffOf = (freq: number, y: number) => Math.min(16000, freq * 1.2 * 2 ** ((1 - y) * 5));

  // --------------------------------------------------------------- voices

  /** Created on the first note, since browsers only start audio from a click or key. */
  function wake(): Engine {
    window.clearTimeout(suspendTimer);
    engine ??= createEngine(settings.volume, echoSend());
    if (engine.ctx.state !== 'running') void engine.ctx.resume();
    return engine;
  }

  const sustaining = () => hold || shift;

  function startVoice(step: number, x: number, y: number, key: number | null = null): Voice {
    const e = wake();
    if (voices.length >= MAX_VOICES) release(voices.find((v) => !v.down) ?? voices[0], true);
    const t = e.ctx.currentTime;
    const f = freqOf(step);
    const filter = new BiquadFilterNode(e.ctx, { type: 'lowpass', frequency: cutoffOf(f, y), Q: 2 });
    const amp = new GainNode(e.ctx, { gain: 0 });
    const oscs = DETUNE.map((detune) => {
      const o = new OscillatorNode(e.ctx, { type: settings.wave, frequency: f, detune });
      o.connect(filter);
      o.start(t);
      return o;
    });
    filter.connect(amp).connect(e.bus);
    amp.gain.setTargetAtTime(LEVEL[settings.wave], t, ATTACK);

    const now = performance.now();
    const v: Voice = { oscs, filter, amp, step, x, y, key, down: true, ending: false, trail: { pts: [], live: true } };
    if (!reducedMotion.matches) {
      v.trail.pts.push({ x, y, t: now });
      trails.add(v.trail);
      ripples.push({ x, y, t: now });
    }
    voices.push(v);
    root.classList.add('has-played');
    kick();
    return v;
  }

  /** Point the voice at its current step and height. Pitch glides; the filter just follows. */
  function shape(v: Voice, pitch: boolean) {
    if (!engine) return;
    const t = engine.ctx.currentTime;
    const f = freqOf(v.step);
    const glide = Math.max(settings.glide / 3, 0.003);
    if (pitch) v.oscs.forEach((o) => o.frequency.setTargetAtTime(f, t, glide));
    v.filter.frequency.setTargetAtTime(cutoffOf(f, v.y), t, pitch ? Math.max(glide, 0.012) : 0.012);
  }

  function moveVoice(v: Voice, x: number, y: number) {
    const step = stepAt(x);
    const pitch = step !== v.step;
    v.x = x;
    v.y = y;
    v.step = step;
    shape(v, pitch);
    kick();
  }

  function release(v: Voice, fast = false) {
    if (v.ending || !engine) return;
    v.ending = true;
    v.trail.live = false;
    voices.splice(voices.indexOf(v), 1);
    const t = engine.ctx.currentTime;
    const tau = fast ? STEAL : RELEASE;
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setTargetAtTime(0, t, tau);
    v.oscs.forEach((o) => o.stop(t + tau * 8));
    v.oscs[0].onended = () => {
      v.filter.disconnect();
      v.amp.disconnect();
    };
    kick();
  }

  /** The finger or key came up. The note stops unless something is holding it. */
  function letGo(v: Voice | undefined) {
    if (!v || v.ending) return;
    v.down = false;
    if (sustaining()) kick();
    else release(v);
  }

  function afterSustain() {
    if (!sustaining()) voices.filter((v) => !v.down).forEach((v) => release(v));
  }

  function setShift(on: boolean) {
    if (shift === on) return;
    shift = on;
    afterSustain();
  }

  function setHold(on: boolean) {
    hold = on;
    holdBtn.setAttribute('aria-pressed', String(on));
    holdBtn.classList.toggle('btn-primary', on);
    afterSustain();
  }

  function stopAll() {
    [...voices].forEach((v) => release(v, true));
    pointers.clear();
    keys.clear();
  }

  function releaseInputs() {
    keys.forEach((v) => letGo(v));
    keys.clear();
    pointers.forEach((v) => letGo(v));
    pointers.clear();
    setShift(false);
  }

  /** Scale or octave changed: every sounding note moves to its new pitch, gliding if glide is on. */
  function retuneAll() {
    const cols = columns();
    voices.forEach((v) => {
      if (v.key !== null) {
        v.step = Math.min(v.key, cols - 1);
        v.x = (v.step + 0.5) / cols;
      } else v.step = stepAt(v.x);
      shape(v, true);
    });
    kick();
  }

  // ------------------------------------------------------------------ pad

  pad.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    pad.focus({ preventScroll: true });
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; the voice still starts and stops on its own events.
    }
    setShift(e.shiftKey);
    const r = pad.getBoundingClientRect();
    const x = clamp01((e.clientX - r.left) / r.width);
    const y = clamp01((e.clientY - r.top) / r.height);
    // The mouse reuses one pointer id; let go of anything a lost pointerup left behind.
    letGo(pointers.get(e.pointerId));
    pointers.set(e.pointerId, startVoice(stepAt(x), x, y));
  });

  pad.addEventListener('pointermove', (e) => {
    const v = pointers.get(e.pointerId);
    if (!v || v.ending) return;
    const r = pad.getBoundingClientRect();
    const at = (p: PointerEvent) => ({ x: clamp01((p.clientX - r.left) / r.width), y: clamp01((p.clientY - r.top) / r.height) });
    if (!reducedMotion.matches) {
      // Coalesced events keep fast strokes smooth. Points closer than 2px add nothing.
      const now = performance.now();
      const batch = e.getCoalescedEvents?.() ?? [];
      for (const c of batch.length ? batch : [e]) {
        const p = at(c);
        const last = v.trail.pts[v.trail.pts.length - 1];
        if (last && Math.hypot((p.x - last.x) * r.width, (p.y - last.y) * r.height) < 2) continue;
        v.trail.pts.push({ ...p, t: now });
      }
    }
    const p = at(e);
    moveVoice(v, p.x, p.y);
  });

  const lift = (e: PointerEvent) => {
    const v = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (e.type === 'pointerup') setShift(e.shiftKey);
    // Touch only counts as a user gesture on the way up, so mobile audio may unlock here.
    if (engine && engine.ctx.state !== 'running') void engine.ctx.resume();
    letGo(v);
  };
  pad.addEventListener('pointerup', lift);
  pad.addEventListener('pointercancel', lift);
  pad.addEventListener('contextmenu', (e) => e.preventDefault());

  // ------------------------------------------------------------- keyboard

  win.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') return setShift(true);
    const t = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || t.matches('select, textarea, input:not([type="range"], [type="radio"])')) return;

    const i = KEYS.indexOf(e.code);
    if (i >= 0 && i < columns()) {
      e.preventDefault();
      if (e.repeat) return;
      setShift(e.shiftKey);
      const old = keys.get(i);
      if (old) release(old, true);
      keys.set(i, startVoice(i, (i + 0.5) / columns(), keyY, i));
      return;
    }
    if (e.key === 'Escape' && (voices.length || hold)) {
      e.preventDefault();
      stopAll();
      setHold(false);
      return;
    }
    if (t !== pad) return;
    // On the pad, arrows stand in for the axes a mouse would reach: up is brighter, sideways shifts octave.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      keyY = clamp01(keyY + (e.key === 'ArrowUp' ? -0.1 : 0.1));
      keys.forEach((v) => {
        v.y = keyY;
        shape(v, false);
      });
      kick();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setOctave(settings.octave + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });

  win.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') return setShift(false);
    const i = KEYS.indexOf(e.code);
    if (i < 0) return;
    const v = keys.get(i);
    keys.delete(i);
    letGo(v);
  });

  // Keys held while focus leaves never send keyup. Let them go rather than drone forever.
  win.addEventListener('focusout', (e) => {
    if (e.relatedTarget instanceof Node && win.contains(e.relatedTarget)) return;
    keys.forEach((v) => letGo(v));
    keys.clear();
    setShift(false);
  });
  window.addEventListener('blur', releaseInputs);

  // ------------------------------------------------------------- controls

  waveIns.forEach((input) =>
    input.addEventListener('change', () => {
      if (!input.checked) return;
      settings.wave = input.value as Wave;
      if (!engine) return;
      const t = engine.ctx.currentTime;
      voices.forEach((v) => {
        v.oscs.forEach((o) => (o.type = settings.wave));
        v.amp.gain.setTargetAtTime(LEVEL[settings.wave], t, 0.02);
      });
    }),
  );

  scaleSel.addEventListener('change', () => {
    settings.scale = scaleSel.value as ScaleId;
    retuneAll();
  });

  // aria-disabled rather than disabled, so the button keeps focus at either end of the range.
  function setOctave(n: number) {
    settings.octave = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, n));
    octOut.value = String(settings.octave);
    octDown.setAttribute('aria-disabled', String(settings.octave <= MIN_OCTAVE));
    octUp.setAttribute('aria-disabled', String(settings.octave >= MAX_OCTAVE));
    retuneAll();
  }
  octDown.addEventListener('click', () => setOctave(settings.octave - 1));
  octUp.addEventListener('click', () => setOctave(settings.octave + 1));

  /** Sliders run 0 to 100. Each one fills its track up to the thumb and reads out its value. */
  function bindRange(input: HTMLInputElement, apply: (v: number) => string) {
    const update = () => {
      const v = Number(input.value);
      input.style.setProperty('--fill', `${v}%`);
      input.setAttribute('aria-valuetext', apply(v));
    };
    input.addEventListener('input', update);
    update();
  }

  bindRange(glideIn, (v) => {
    // Squared, so the short glides most people want get most of the travel.
    settings.glide = (v / 100) ** 2 * 0.6;
    return v ? `${Math.round(settings.glide * 1000)} ms` : 'Off';
  });
  bindRange(echoIn, (v) => {
    settings.echo = v / 100;
    engine?.send.gain.setTargetAtTime(echoSend(), engine.ctx.currentTime, 0.03);
    return `${v}%`;
  });
  bindRange(volIn, (v) => {
    settings.volume = v / 100;
    engine?.master.gain.setTargetAtTime(settings.volume, engine.ctx.currentTime, 0.03);
    return `${v}%`;
  });

  holdBtn.addEventListener('click', () => setHold(!hold));

  // ------------------------------------------------------------- drawing

  /** The theme follows the sky, so colors come from the live CSS variables, never from here. */
  function readInk() {
    const cs = getComputedStyle(root);
    const rgb = (name: string, fallback: string) => {
      const parts = cs.getPropertyValue(name).trim().split(/[\s,/]+/).filter(Boolean);
      return parts.length >= 3 ? parts.slice(0, 3).join(', ') : fallback;
    };
    ink = {
      accent: rgb('--accent-rgb', ink.accent),
      fg: rgb('--fg-rgb', ink.fg),
      mono: cs.getPropertyValue('--font-mono').trim() || ink.mono,
    };
  }

  const rgba = (rgb: string, a: number) => `rgba(${rgb}, ${a.toFixed(3)})`;

  function resize() {
    // Layout size, not the bounding box, so the window's open animation doesn't skew it.
    cssW = pad.clientWidth;
    cssH = pad.clientHeight;
    if (!cssW || !cssH) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }

  function prune(now: number) {
    trails.forEach((tr) => {
      const pts = tr.pts;
      // Drop a point once the segment after it has faded, so tails shrink smoothly.
      let cut = 0;
      while (cut < pts.length - 1 && now - pts[cut + 1].t > TRAIL_MS) cut++;
      if (cut) pts.splice(0, cut);
      if (!tr.live && (pts.length < 2 || now - pts[pts.length - 1].t > TRAIL_MS)) trails.delete(tr);
    });
    while (ripples.length && now - ripples[0].t > RIPPLE_MS) ripples.shift();
  }

  function draw(now: number) {
    if (!cssW || !cssH) return;
    g.clearRect(0, 0, cssW, cssH);
    const cols = columns();
    const n = scale().length;
    const cw = cssW / cols;
    const lit = new Set(voices.map((v) => v.step));

    // One column per note, the roots ruled a little heavier.
    for (let i = 0; i < cols; i++) {
      if (lit.has(i)) {
        g.fillStyle = rgba(ink.accent, 0.12);
        g.fillRect(i * cw, 0, cw, cssH);
      }
      if (i > 0) {
        g.fillStyle = rgba(ink.fg, i % n === 0 ? 0.16 : 0.06);
        g.fillRect(Math.round(i * cw), 0, 1, cssH);
      }
    }

    g.textAlign = 'center';
    g.font = `600 11px ${ink.mono}`;
    g.textBaseline = 'alphabetic';
    for (let i = 0; i < cols; i++) {
      const tonic = i % n === 0;
      if (cw < 20 && !tonic) continue;
      g.fillStyle = rgba(ink.fg, lit.has(i) ? 0.95 : tonic ? 0.7 : 0.42);
      g.fillText(noteName(i), (i + 0.5) * cw, cssH - 10);
    }
    if (cw >= 14) {
      g.textBaseline = 'top';
      g.fillStyle = rgba(ink.fg, 0.32);
      for (let i = 0; i < Math.min(KEYS.length, cols); i++) g.fillText(KEY_LABELS[i], (i + 0.5) * cw, 10);
    }

    if (!reducedMotion.matches) {
      g.lineCap = 'round';
      trails.forEach(({ pts }) => {
        for (let i = 1; i < pts.length; i++) {
          const k = 1 - (now - pts[i].t) / TRAIL_MS;
          if (k <= 0) continue;
          g.strokeStyle = rgba(ink.accent, k * k * 0.85);
          g.lineWidth = 1.5 + k * 6;
          g.beginPath();
          g.moveTo(pts[i - 1].x * cssW, pts[i - 1].y * cssH);
          g.lineTo(pts[i].x * cssW, pts[i].y * cssH);
          g.stroke();
        }
      });
      g.lineWidth = 2;
      ripples.forEach((r) => {
        const k = (now - r.t) / RIPPLE_MS;
        if (k >= 1) return;
        g.strokeStyle = rgba(ink.accent, (1 - k) * 0.6);
        g.beginPath();
        g.arc(r.x * cssW, r.y * cssH, 8 + k * 34, 0, TAU);
        g.stroke();
      });
    }

    // A solid dot under a finger or key; a ring for a note that's only being held.
    voices.forEach((v) => {
      const x = v.x * cssW;
      const y = v.y * cssH;
      g.fillStyle = rgba(ink.accent, 0.18);
      g.beginPath();
      g.arc(x, y, 18, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(x, y, v.down ? 8 : 7, 0, TAU);
      if (v.down) {
        g.fillStyle = rgba(ink.accent, 1);
        g.fill();
      } else {
        g.strokeStyle = rgba(ink.accent, 1);
        g.lineWidth = 2;
        g.stroke();
      }
    });
  }

  function frame(now: number) {
    raf = 0;
    prune(now);
    draw(now);
    // Reduced motion draws one still frame per change; otherwise run until the last trail fades.
    if (!reducedMotion.matches && (voices.length || trails.size || ripples.length)) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(pad);
  // sky.ts rewrites the theme variables on <html> every half minute.
  new MutationObserver(() => {
    readInk();
    if (cssW) kick();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  document.fonts?.ready.then(() => cssW && kick());
  reducedMotion.addEventListener('change', () => {
    trails.clear();
    ripples.length = 0;
    kick();
  });

  // ------------------------------------------------------------ lifecycle

  /** Closed or minimized: silence, stop drawing, and let the audio device sleep. */
  function sleep() {
    stopAll();
    setShift(false);
    trails.clear();
    ripples.length = 0;
    cancelAnimationFrame(raf);
    raf = 0;
    if (engine) {
      const ctx = engine.ctx;
      suspendTimer = window.setTimeout(() => void ctx.suspend(), 120);
    }
  }

  win.addEventListener('win:minimize', sleep);
  win.addEventListener('win:close', () => {
    sleep();
    setHold(false);
    root.classList.remove('has-played');
  });
  const wakeView = () => {
    readInk();
    resize();
  };
  win.addEventListener('win:open', wakeView);
  win.addEventListener('win:restore', wakeView);

  readInk();
  setOctave(settings.octave);
}
