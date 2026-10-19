import {
  START_FEN,
  bestMove,
  colorOf,
  fromFen,
  inCheck,
  kingSquare,
  legalMoves,
  makeMove,
  outcome,
  positionKey,
  squareName,
  toSan,
  type Move,
  type Outcome,
  type Piece,
  type Promo,
  type State,
} from './engine';
import { pieceMarkup } from './pieces';
import type { SearchReply, SearchRequest } from './worker';

const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Promotion choices, top to bottom in the picker. */
const PROMOS: Promo[] = ['q', 'r', 'b', 'n'];

/** The shortest pause before Mort replies, so his moves read as decisions. */
const THINK_MS = 420;
const BUDGET_MS = 800;
const DEPTH = 3;

interface Ply {
  before: State;
  move: Move;
  san: string;
}

const pieceSvg = (p: Piece) => pieceMarkup(p.toLowerCase(), colorOf(p));

function describeOutcome(o: Outcome): string {
  switch (o.kind) {
    case 'checkmate':
      return o.winner === 'w' ? 'Checkmate. You beat Mort.' : 'Checkmate. Mort wins this one.';
    case 'stalemate':
      return 'Stalemate. It’s a draw.';
    case 'repetition':
      return 'Draw by repetition.';
    case 'material':
      return 'Draw. Neither side can force mate.';
    case 'fifty':
      return 'Draw by the fifty-move rule.';
  }
}

/** Mort's move in words. Screen readers stumble over notation like "Nxe4+". */
function spokenMove(m: Move): string {
  if (m.castle) return `Mort castled ${m.castle.toLowerCase() === 'k' ? 'kingside' : 'queenside'}.`;
  const piece = NAMES[m.piece.toLowerCase()];
  const sq = squareName(m.to);
  const promo = m.promo ? ` and promoted to a ${NAMES[m.promo]}` : '';
  return m.captured
    ? `Mort took your ${NAMES[m.captured.toLowerCase()]} on ${sq} with a ${piece}${promo}.`
    : `Mort played ${piece} to ${sq}${promo}.`;
}

// ------------------------------------------------------------ Mort's search

interface Job {
  id: number;
  state: State;
  started: number;
  done: (m: Move | null) => void;
}

/**
 * Runs Mort's search in a Web Worker so the board never freezes. Where a worker can't start
 * (old browsers, strict CSP), the search runs on this thread after the same pause.
 */
function createSearch() {
  let worker: Worker | null = null;
  let workerOk = true;
  let lastId = 0;
  let job: Job | null = null;
  let timer = 0;

  const remaining = (j: Job) => Math.max(0, THINK_MS - (performance.now() - j.started));

  /** Hand the move over once the minimum pause has passed. Replies for dropped jobs are ignored. */
  function finish(id: number, move: Move | null) {
    if (!job || job.id !== id) return;
    const { done } = job;
    const wait = remaining(job);
    job = null;
    timer = window.setTimeout(() => done(move), wait);
  }

  function searchHere(j: Job) {
    timer = window.setTimeout(() => finish(j.id, bestMove(j.state, BUDGET_MS, DEPTH)), remaining(j));
  }

  function spawn(): Worker | null {
    if (worker || !workerOk) return worker;
    let w: Worker;
    try {
      w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch {
      workerOk = false;
      return null;
    }
    w.addEventListener('message', (e: MessageEvent<SearchReply>) => finish(e.data.id, e.data.move));
    // A worker that fails to load reports here, not in the constructor. Stop using workers.
    w.addEventListener('error', (e) => {
      e.preventDefault();
      w.terminate();
      if (w !== worker) return;
      worker = null;
      workerOk = false;
      if (job) searchHere(job);
    });
    return (worker = w);
  }

  /** Drop the search in flight, if any. Its reply, should one arrive, is ignored. */
  function cancel() {
    window.clearTimeout(timer);
    // A search can't stop midway. A fresh worker is quicker than waiting this one out.
    if (job && worker) {
      worker.terminate();
      worker = null;
    }
    job = null;
  }

  /** Ask for Mort's move in `state`. `done` runs once, after at least THINK_MS, unless cancelled. */
  function start(state: State, done: (m: Move | null) => void) {
    cancel();
    job = { id: ++lastId, state, started: performance.now(), done };
    const w = spawn();
    if (!w) return searchHere(job);
    const req: SearchRequest = { id: job.id, state, budgetMs: BUDGET_MS, maxDepth: DEPTH };
    w.postMessage(req);
  }

  return { start, cancel };
}

// -------------------------------------------------------------------- board

export function mountChess(root: HTMLElement) {
  const boardEl = root.querySelector<HTMLElement>('.cb-board')!;
  const statusEl = root.querySelector<HTMLElement>('.cb-status')!;
  const mortEl = root.querySelector<HTMLElement>('.cb-mort-line')!;
  const movesEl = root.querySelector<HTMLOListElement>('.cb-moves')!;
  const takenByYou = root.querySelector<HTMLElement>('.cb-taken-you')!;
  const takenByMort = root.querySelector<HTMLElement>('.cb-taken-mort')!;
  const newBtn = root.querySelector<HTMLButtonElement>('[data-chess="new"]')!;
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-chess="undo"]')!;

  const mort = createSearch();

  let state = fromFen(START_FEN);
  let plies: Ply[] = [];
  let keys = [positionKey(state)];
  let legal = legalMoves(state);
  let selected = -1;
  let focusSq = 52; // e2
  let thinking = false;
  let over: Outcome | null = null;
  /** The four moves of a promotion waiting on the picker, or null. */
  let promoting: Move[] | null = null;

  const squares: HTMLButtonElement[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sq ' + (((sq >> 3) + (sq & 7)) % 2 ? 'sq-dark' : 'sq-light');
    btn.dataset.sq = String(sq);
    btn.tabIndex = sq === focusSq ? 0 : -1;
    boardEl.append(btn);
    squares.push(btn);
  }

  // The promotion picker: a column over the promotion square, queen first.
  const picker = document.createElement('div');
  picker.className = 'cb-promo';
  picker.hidden = true;
  picker.setAttribute('role', 'menu');
  picker.setAttribute('aria-label', 'Promote to');
  const promoBtns = PROMOS.map((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cb-promo-opt';
    btn.tabIndex = -1;
    btn.dataset.promo = p;
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('aria-label', NAMES[p][0].toUpperCase() + NAMES[p].slice(1));
    btn.innerHTML = pieceMarkup(p, 'w');
    picker.append(btn);
    return btn;
  });
  boardEl.append(picker);

  function targetsFrom(sq: number) {
    return legal.filter((m) => m.from === sq);
  }

  function render() {
    const last = plies.at(-1)?.move;
    const checkSq = inCheck(state) ? kingSquare(state.b, state.t) : -1;
    const targets = selected >= 0 ? targetsFrom(selected) : [];

    squares.forEach((btn, sq) => {
      const p = state.b[sq];
      const target = targets.find((m) => m.to === sq);
      btn.classList.toggle('is-selected', sq === selected);
      btn.classList.toggle('is-last', !!last && (last.from === sq || last.to === sq));
      btn.classList.toggle('is-target', !!target && !target.captured);
      btn.classList.toggle('is-capture', !!target?.captured);
      btn.classList.toggle('is-check', sq === checkSq);

      const file = sq & 7;
      const rank = sq >> 3;
      const coords =
        (file === 0 ? `<span class="sq-rank">${8 - rank}</span>` : '') +
        (rank === 7 ? `<span class="sq-file">${'abcdefgh'[file]}</span>` : '');
      btn.innerHTML = coords + (p ? pieceSvg(p) : '');

      const who = p ? `${colorOf(p) === 'w' ? 'white' : 'black'} ${NAMES[p.toLowerCase()]}` : 'empty';
      const hint = target ? (target.promo ? ', legal move, promotes' : ', legal move') : '';
      btn.setAttribute('aria-label', `${squareName(sq)}, ${who}${hint}`);
      btn.setAttribute('aria-pressed', String(sq === selected));
    });

    // Move list: a numbered sequence, one row per full move.
    movesEl.innerHTML = '';
    for (let i = 0; i < plies.length; i += 2) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="mv-w">${plies[i].san}</span><span class="mv-b">${plies[i + 1]?.san ?? ''}</span>`;
      movesEl.append(li);
    }
    movesEl.scrollTop = movesEl.scrollHeight;

    const captured = plies.map((p) => p.move.captured).filter(Boolean) as Piece[];
    takenByYou.innerHTML = captured.filter((p) => colorOf(p) === 'b').map(pieceSvg).join('');
    takenByMort.innerHTML = captured.filter((p) => colorOf(p) === 'w').map(pieceSvg).join('');

    if (over) statusEl.textContent = describeOutcome(over);
    else if (thinking) statusEl.textContent = 'Mort is thinking…';
    else statusEl.textContent = inCheck(state) ? 'Check. Your move.' : 'Your move.';
    root.classList.toggle('is-thinking', thinking);
    // Undo stays live while Mort thinks: it takes your move back and drops his search.
    undoBtn.disabled = plies.length === 0;
  }

  /** Mort's line, read out by its live region. `spoken` replaces the notation for screen readers. */
  function mortSays(text: string, spoken?: string) {
    if (!spoken) {
      mortEl.textContent = text;
      return;
    }
    mortEl.innerHTML = `<span aria-hidden="true">${text}</span><span class="cb-sr">${spoken}</span>`;
  }

  function play(m: Move) {
    const san = toSan(state, m, legal);
    plies.push({ before: state, move: m, san });
    state = makeMove(state, m);
    keys.push(positionKey(state));
    legal = legalMoves(state);
    selected = -1;
    over = outcome(state, keys);
  }

  function mortMoves() {
    thinking = true;
    render();
    mort.start(state, (reply) => {
      thinking = false;
      // Play the matching legal move, never the reply itself: it came back through a copy.
      const m = reply && legal.find((o) => o.from === reply.from && o.to === reply.to && o.promo === reply.promo);
      if (!m) return render();
      const takes = m.captured ? `took your ${NAMES[m.captured.toLowerCase()]}` : '';
      play(m);
      const san = plies.at(-1)!.san;
      mortSays(takes ? `Mort ${takes} with ${san}.` : `Mort played ${san}.`, spokenMove(m));
      render();
    });
  }

  function commit(m: Move) {
    play(m);
    render();
    if (!over) mortMoves();
  }

  function choose(sq: number) {
    if (thinking || over || promoting || state.t !== 'w') return;
    if (selected >= 0) {
      const options = targetsFrom(selected).filter((m) => m.to === sq);
      // A pawn reaching the last rank has four moves to the same square. Ask which piece.
      if (options.length > 1) return askPromotion(options);
      if (options.length) return commit(options[0]);
    }
    const p = state.b[sq];
    selected = p && colorOf(p) === 'w' && sq !== selected ? sq : -1;
    render();
  }

  // --------------------------------------------------------- promotion picker

  // The press that opens the picker can end on top of it, and some browsers (iOS Safari) then
  // click whatever is under the finger. Clicks from that press don't count.
  let pressing = false;
  let openedByPress = false;

  function askPromotion(moves: Move[]) {
    promoting = moves;
    openedByPress = pressing;
    render();
    picker.style.left = `${(moves[0].to & 7) * 12.5}%`;
    picker.hidden = false;
    focusPromo(0);
  }

  function focusPromo(i: number) {
    const k = (i + promoBtns.length) % promoBtns.length;
    promoBtns.forEach((btn, j) => (btn.tabIndex = j === k ? 0 : -1));
    promoBtns[k].focus({ preventScroll: true });
  }

  function hidePicker() {
    promoting = null;
    picker.hidden = true;
  }

  /** Back out of a promotion: the pawn stays put and nothing is selected. */
  function cancelPromotion(refocus: boolean) {
    if (!promoting) return;
    const from = promoting[0].from;
    hidePicker();
    selected = -1;
    render();
    if (refocus) squares[from].focus();
  }

  function promote(p: Promo) {
    const m = promoting?.find((o) => o.promo === p);
    if (!m) return;
    hidePicker();
    squares[m.to].focus();
    commit(m);
  }

  picker.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.cb-promo-opt');
    if (!btn || (e.detail !== 0 && openedByPress)) return;
    promote(btn.dataset.promo as Promo);
  });

  picker.addEventListener('keydown', (e) => {
    const i = promoBtns.indexOf(e.target as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') focusPromo(i + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') focusPromo(i - 1);
    else if (e.key === 'Home') focusPromo(0);
    else if (e.key === 'End') focusPromo(promoBtns.length - 1);
    else if (e.key === 'Escape') cancelPromotion(true);
    else return;
    e.preventDefault();
  });

  // Tabbing away cancels, as it closes a menu. Focus lost to nothing (switching apps) doesn't.
  picker.addEventListener('focusout', (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && !picker.contains(next)) cancelPromotion(false);
  });

  // A press anywhere else cancels the promotion. On the board it then acts as usual.
  document.addEventListener(
    'pointerdown',
    (e) => {
      pressing = true;
      openedByPress = false;
      if (promoting && !picker.contains(e.target as Node)) cancelPromotion(false);
    },
    true,
  );
  document.addEventListener('pointerup', () => (pressing = false));
  document.addEventListener('pointercancel', () => (pressing = false));
  // Bubble phase, so the picker sees a click before this clears the flag.
  document.addEventListener('click', () => (openedByPress = false));

  const winEl = root.closest<HTMLElement>('.win');
  winEl?.addEventListener('win:close', () => cancelPromotion(false));
  winEl?.addEventListener('win:minimize', () => cancelPromotion(false));

  // ------------------------------------------------------------ pointer input

  let drag: { from: number; x: number; y: number; ghost: HTMLElement | null; pointerId: number } | null = null;

  boardEl.addEventListener('pointerdown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.sq');
    if (!btn || e.button !== 0) return;
    e.preventDefault();
    // Focus first, since choosing a promotion square moves focus into the picker.
    btn.focus({ preventScroll: true });
    const sq = Number(btn.dataset.sq);
    const p = state.b[sq];
    if (p && colorOf(p) === 'w' && !thinking && !over) {
      drag = { from: sq, x: e.clientX, y: e.clientY, ghost: null, pointerId: e.pointerId };
      boardEl.setPointerCapture(e.pointerId);
    } else {
      choose(sq);
    }
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) {
      if (selected !== drag.from) {
        selected = drag.from;
        render();
      }
      const size = squares[0].getBoundingClientRect().width;
      const ghost = document.createElement('div');
      ghost.className = 'cb-ghost';
      ghost.style.width = ghost.style.height = `${size}px`;
      ghost.innerHTML = pieceSvg(state.b[drag.from]!);
      document.body.append(ghost);
      squares[drag.from].classList.add('is-lifted');
      drag.ghost = ghost;
    }
    if (drag.ghost) {
      const half = drag.ghost.offsetWidth / 2;
      drag.ghost.style.transform = `translate(${e.clientX - half}px, ${e.clientY - half}px)`;
    }
  });

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { from, ghost } = drag;
    drag = null;
    squares[from].classList.remove('is-lifted');
    if (!ghost) {
      choose(from);
      return;
    }
    ghost.remove();
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLButtonElement>('.sq');
    const to = under && boardEl.contains(under) ? Number(under.dataset.sq) : -1;
    if (to >= 0 && to !== from && targetsFrom(from).some((m) => m.to === to)) {
      selected = from;
      choose(to);
    } else {
      render();
    }
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  // ----------------------------------------------------------- keyboard input

  // Keyboard activation arrives as a click with detail 0; mouse and touch go through pointer events.
  boardEl.addEventListener('click', (e) => {
    if ((e as MouseEvent).detail !== 0) return;
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.sq');
    if (btn) choose(Number(btn.dataset.sq));
  });

  boardEl.addEventListener('keydown', (e) => {
    const moves: Record<string, number> = { ArrowUp: -8, ArrowDown: 8, ArrowLeft: -1, ArrowRight: 1 };
    if (!(e.key in moves) || picker.contains(e.target as Node)) return;
    e.preventDefault();
    const step = moves[e.key];
    const file = focusSq & 7;
    if ((step === -1 && file === 0) || (step === 1 && file === 7)) return;
    const next = focusSq + step;
    if (next < 0 || next > 63) return;
    squares[focusSq].tabIndex = -1;
    focusSq = next;
    squares[focusSq].tabIndex = 0;
    squares[focusSq].focus();
  });

  boardEl.addEventListener('focusin', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.sq');
    if (!btn) return;
    squares[focusSq].tabIndex = -1;
    focusSq = Number(btn.dataset.sq);
    btn.tabIndex = 0;
  });

  // ------------------------------------------------------------------ actions

  newBtn.addEventListener('click', () => {
    mort.cancel();
    hidePicker();
    state = fromFen(START_FEN);
    plies = [];
    keys = [positionKey(state)];
    legal = legalMoves(state);
    selected = -1;
    thinking = false;
    over = null;
    mortSays('You move first.');
    render();
  });

  undoBtn.addEventListener('click', () => {
    if (!plies.length) return;
    mort.cancel();
    hidePicker();
    thinking = false;
    // Take back to the last position where it was your move.
    do {
      state = plies.pop()!.before;
      keys.pop();
    } while (plies.length && state.t !== 'w');
    legal = legalMoves(state);
    selected = -1;
    over = null;
    mortSays('Move taken back.');
    render();
  });

  render();
}
