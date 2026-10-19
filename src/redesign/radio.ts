// The lofi radio: an embedded lofi.srizan.dev player with our own deck controls.
// Until the player answers with its embed handshake, the full page is shown scaled down to fit;
// once it does, the compact embed layout takes over and the deck drives it over postMessage.

const ORIGIN = 'https://lofi.srizan.dev';
/** The size the full (non-embed) page is laid out at before it's scaled into the window. */
const VIRTUAL_W = 1040;
const VIRTUAL_H = 650;

interface LofiState {
  playing: boolean;
  volume: number;
  station?: string;
  track?: { title?: string; artist?: string; cover?: string };
}

export function mountRadio(root: HTMLElement) {
  const win = root.closest<HTMLElement>('.win')!;
  const screen = root.querySelector<HTMLElement>('.radio-screen')!;
  const frame = root.querySelector<HTMLIFrameElement>('iframe')!;
  const deck = root.querySelector<HTMLElement>('.radio-deck')!;
  const playBtn = root.querySelector<HTMLButtonElement>('[data-radio="toggle"]')!;
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-radio="next"]')!;
  const volume = root.querySelector<HTMLInputElement>('[data-radio="volume"]')!;
  const now = root.querySelector<HTMLElement>('.radio-now')!;
  const cover = root.querySelector<HTMLImageElement>('.radio-cover')!;

  let embedded = false;
  let state: LofiState = { playing: false, volume: Number(volume.value) };

  const send = (msg: object) => frame.contentWindow?.postMessage(msg, ORIGIN);

  /** Scale the full page to fit until the embed layout is available. */
  function fit() {
    if (embedded) {
      frame.style.removeProperty('width');
      frame.style.removeProperty('height');
      frame.style.removeProperty('transform');
      return;
    }
    const scale = Math.min(screen.clientWidth / VIRTUAL_W, screen.clientHeight / VIRTUAL_H);
    frame.style.width = `${VIRTUAL_W}px`;
    frame.style.height = `${VIRTUAL_H}px`;
    frame.style.transform = `scale(${scale})`;
  }

  function render() {
    root.classList.toggle('is-embedded', embedded);
    deck.hidden = !embedded;
    playBtn.setAttribute('aria-pressed', String(state.playing));
    playBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    playBtn.classList.toggle('is-playing', state.playing);
    if (document.activeElement !== volume) volume.value = String(Math.round(state.volume));
    const title = state.track?.title;
    const artist = state.track?.artist;
    now.textContent = title ? (artist ? `${title}, ${artist}` : title) : state.station ?? 'Ready';
    cover.hidden = !state.track?.cover;
    if (state.track?.cover && cover.src !== state.track.cover) cover.src = state.track.cover;
    fit();
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== ORIGIN || e.source !== frame.contentWindow) return;
    const msg = e.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (msg.type === 'lofi:ready') {
      embedded = true;
      // Start quiet. The embed reads ?volume=15 too; this covers players that ignore it.
      send({ type: 'lofi:setVolume', value: Number(volume.value) });
      send({ type: 'lofi:getState' });
      render();
    } else if (msg.type === 'lofi:state') {
      state = {
        playing: !!msg.playing,
        volume: typeof msg.volume === 'number' ? msg.volume : state.volume,
        station: typeof msg.station === 'string' ? msg.station : undefined,
        track: msg.track && typeof msg.track === 'object' ? msg.track : undefined,
      };
      render();
    }
  });

  playBtn.addEventListener('click', () => send({ type: 'lofi:toggle' }));
  nextBtn.addEventListener('click', () => send({ type: 'lofi:next' }));
  volume.addEventListener('input', () => send({ type: 'lofi:setVolume', value: Number(volume.value) }));

  // The iframe unloads when the window closes, so the handshake has to happen again next time.
  win.addEventListener('win:close', () => {
    embedded = false;
    state = { playing: false, volume: Number(volume.defaultValue) };
    render();
  });
  win.addEventListener('win:open', () => requestAnimationFrame(fit));

  new ResizeObserver(fit).observe(screen);
  render();
}
