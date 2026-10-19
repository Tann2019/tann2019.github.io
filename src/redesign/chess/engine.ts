// A small, complete chess engine: legal move generation (castling, en passant, promotion),
// notation, end-of-game detection, and an alpha-beta search for Mort.
//
// Board layout: index 0 is a8, 7 is h8, 56 is a1, 63 is h1. Uppercase is white.

export type Color = 'w' | 'b';
export type Piece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Promo = 'q' | 'r' | 'b' | 'n';

export interface Move {
  from: number;
  to: number;
  piece: Piece;
  captured?: Piece;
  promo?: Promo;
  ep?: boolean;
  castle?: 'K' | 'Q' | 'k' | 'q';
  double?: boolean;
}

export interface State {
  b: (Piece | null)[];
  t: Color;
  /** Castling rights, e.g. "KQkq". */
  c: string;
  /** En passant target square, or -1. */
  ep: number;
  /** Halfmove clock for the fifty-move rule. */
  h: number;
  f: number;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const FILES = 'abcdefgh';

export const squareName = (sq: number) => FILES[sq & 7] + (8 - (sq >> 3));
export const colorOf = (p: Piece): Color => (p === p.toUpperCase() ? 'w' : 'b');
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function fromFen(fen: string): State {
  const [placement, turn, castling, ep, half, full] = fen.split(' ');
  const b: (Piece | null)[] = [];
  for (const ch of placement.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) b.push(null);
    else b.push(ch as Piece);
  }
  const epSq = ep === '-' ? -1 : FILES.indexOf(ep[0]) + (8 - Number(ep[1])) * 8;
  return { b, t: turn as Color, c: castling === '-' ? '' : castling, ep: epSq, h: Number(half), f: Number(full) };
}

/** Position identity for repetition checks. */
export function positionKey(s: State): string {
  return s.b.map((p) => p ?? '.').join('') + s.t + s.c + s.ep;
}

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const inside = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;

export function attacked(b: (Piece | null)[], sq: number, by: Color): boolean {
  const r = sq >> 3;
  const f = sq & 7;
  const w = by === 'w';

  // A white pawn attacks toward rank 8, so it sits one row below the square it hits.
  const pr = w ? r + 1 : r - 1;
  const pawn = w ? 'P' : 'p';
  if (pr >= 0 && pr < 8) {
    if (f > 0 && b[pr * 8 + f - 1] === pawn) return true;
    if (f < 7 && b[pr * 8 + f + 1] === pawn) return true;
  }

  const knight = w ? 'N' : 'n';
  for (const [dr, df] of KNIGHT) {
    const rr = r + dr;
    const ff = f + df;
    if (inside(rr, ff) && b[rr * 8 + ff] === knight) return true;
  }

  const king = w ? 'K' : 'k';
  for (const [dr, df] of KING) {
    const rr = r + dr;
    const ff = f + df;
    if (inside(rr, ff) && b[rr * 8 + ff] === king) return true;
  }

  const bishop = w ? 'B' : 'b';
  const rook = w ? 'R' : 'r';
  const queen = w ? 'Q' : 'q';
  for (const [dirs, slider] of [[DIAG, bishop], [ORTH, rook]] as const) {
    for (const [dr, df] of dirs) {
      let rr = r + dr;
      let ff = f + df;
      while (inside(rr, ff)) {
        const p = b[rr * 8 + ff];
        if (p) {
          if (p === slider || p === queen) return true;
          break;
        }
        rr += dr;
        ff += df;
      }
    }
  }
  return false;
}

export function kingSquare(b: (Piece | null)[], color: Color): number {
  return b.indexOf(color === 'w' ? 'K' : 'k');
}

export function inCheck(s: State): boolean {
  return attacked(s.b, kingSquare(s.b, s.t), other(s.t));
}

function pushPromotions(moves: Move[], from: number, to: number, piece: Piece, captured?: Piece) {
  for (const promo of ['q', 'n', 'r', 'b'] as Promo[]) moves.push({ from, to, piece, captured, promo });
}

/** Moves that obey piece movement but may leave the king in check. */
export function pseudoMoves(s: State, capturesOnly = false): Move[] {
  const moves: Move[] = [];
  const us = s.t;
  const them = other(us);
  const b = s.b;

  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p || colorOf(p) !== us) continue;
    const r = sq >> 3;
    const f = sq & 7;
    const type = p.toLowerCase();

    if (type === 'p') {
      const dir = us === 'w' ? -1 : 1;
      const startRow = us === 'w' ? 6 : 1;
      const lastRow = us === 'w' ? 0 : 7;
      const r1 = r + dir;
      if (r1 < 0 || r1 > 7) continue;
      const one = r1 * 8 + f;
      if (!b[one]) {
        if (r1 === lastRow) pushPromotions(moves, sq, one, p);
        else if (!capturesOnly) {
          moves.push({ from: sq, to: one, piece: p });
          const two = (r + 2 * dir) * 8 + f;
          if (r === startRow && !b[two]) moves.push({ from: sq, to: two, piece: p, double: true });
        }
      }
      for (const df of [-1, 1]) {
        const ff = f + df;
        if (ff < 0 || ff > 7) continue;
        const to = r1 * 8 + ff;
        const target = b[to];
        if (target && colorOf(target) === them) {
          if (r1 === lastRow) pushPromotions(moves, sq, to, p, target);
          else moves.push({ from: sq, to, piece: p, captured: target });
        } else if (to === s.ep) {
          moves.push({ from: sq, to, piece: p, captured: us === 'w' ? 'p' : 'P', ep: true });
        }
      }
      continue;
    }

    if (type === 'n' || type === 'k') {
      for (const [dr, df] of type === 'n' ? KNIGHT : KING) {
        const rr = r + dr;
        const ff = f + df;
        if (!inside(rr, ff)) continue;
        const to = rr * 8 + ff;
        const target = b[to];
        if (!target) {
          if (!capturesOnly) moves.push({ from: sq, to, piece: p });
        } else if (colorOf(target) === them) {
          moves.push({ from: sq, to, piece: p, captured: target });
        }
      }
      continue;
    }

    const dirs = type === 'b' ? DIAG : type === 'r' ? ORTH : [...DIAG, ...ORTH];
    for (const [dr, df] of dirs) {
      let rr = r + dr;
      let ff = f + df;
      while (inside(rr, ff)) {
        const to = rr * 8 + ff;
        const target = b[to];
        if (!target) {
          if (!capturesOnly) moves.push({ from: sq, to, piece: p });
        } else {
          if (colorOf(target) === them) moves.push({ from: sq, to, piece: p, captured: target });
          break;
        }
        rr += dr;
        ff += df;
      }
    }
  }

  if (!capturesOnly) {
    if (us === 'w' && b[60] === 'K' && !attacked(b, 60, 'b')) {
      if (s.c.includes('K') && !b[61] && !b[62] && b[63] === 'R' && !attacked(b, 61, 'b') && !attacked(b, 62, 'b'))
        moves.push({ from: 60, to: 62, piece: 'K', castle: 'K' });
      if (s.c.includes('Q') && !b[59] && !b[58] && !b[57] && b[56] === 'R' && !attacked(b, 59, 'b') && !attacked(b, 58, 'b'))
        moves.push({ from: 60, to: 58, piece: 'K', castle: 'Q' });
    }
    if (us === 'b' && b[4] === 'k' && !attacked(b, 4, 'w')) {
      if (s.c.includes('k') && !b[5] && !b[6] && b[7] === 'r' && !attacked(b, 5, 'w') && !attacked(b, 6, 'w'))
        moves.push({ from: 4, to: 6, piece: 'k', castle: 'k' });
      if (s.c.includes('q') && !b[3] && !b[2] && !b[1] && b[0] === 'r' && !attacked(b, 3, 'w') && !attacked(b, 2, 'w'))
        moves.push({ from: 4, to: 2, piece: 'k', castle: 'q' });
    }
  }

  return moves;
}

export function makeMove(s: State, m: Move): State {
  const b = s.b.slice();
  const us = s.t;
  b[m.from] = null;
  b[m.to] = m.promo ? ((us === 'w' ? m.promo.toUpperCase() : m.promo) as Piece) : m.piece;
  if (m.ep) b[(m.from >> 3) * 8 + (m.to & 7)] = null;
  if (m.castle === 'K') { b[63] = null; b[61] = 'R'; }
  else if (m.castle === 'Q') { b[56] = null; b[59] = 'R'; }
  else if (m.castle === 'k') { b[7] = null; b[5] = 'r'; }
  else if (m.castle === 'q') { b[0] = null; b[3] = 'r'; }

  let c = s.c;
  if (m.piece === 'K') c = c.replace('K', '').replace('Q', '');
  if (m.piece === 'k') c = c.replace('k', '').replace('q', '');
  for (const sq of [m.from, m.to]) {
    if (sq === 63) c = c.replace('K', '');
    if (sq === 56) c = c.replace('Q', '');
    if (sq === 7) c = c.replace('k', '');
    if (sq === 0) c = c.replace('q', '');
  }

  const resetClock = m.piece === 'P' || m.piece === 'p' || !!m.captured;
  return {
    b,
    t: other(us),
    c,
    ep: m.double ? (m.from + m.to) / 2 : -1,
    h: resetClock ? 0 : s.h + 1,
    f: us === 'b' ? s.f + 1 : s.f,
  };
}

export function legalMoves(s: State): Move[] {
  return pseudoMoves(s).filter((m) => {
    const next = makeMove(s, m);
    return !attacked(next.b, kingSquare(next.b, s.t), next.t);
  });
}

/** Standard algebraic notation for `m`, played from `s`. */
export function toSan(s: State, m: Move, legal: Move[] = legalMoves(s)): string {
  let out: string;
  if (m.castle) {
    out = m.castle === 'K' || m.castle === 'k' ? 'O-O' : 'O-O-O';
  } else if (m.piece === 'P' || m.piece === 'p') {
    out = (m.captured ? FILES[m.from & 7] + 'x' : '') + squareName(m.to);
    if (m.promo) out += '=' + m.promo.toUpperCase();
  } else {
    out = m.piece.toUpperCase();
    const rivals = legal.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
    if (rivals.length) {
      const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7));
      const sameRank = rivals.some((o) => o.from >> 3 === m.from >> 3);
      if (!sameFile) out += FILES[m.from & 7];
      else if (!sameRank) out += String(8 - (m.from >> 3));
      else out += squareName(m.from);
    }
    if (m.captured) out += 'x';
    out += squareName(m.to);
  }
  const next = makeMove(s, m);
  if (inCheck(next)) out += legalMoves(next).length ? '+' : '#';
  return out;
}

export type Outcome =
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' | 'repetition' | 'material' | 'fifty' };

export function outcome(s: State, history: string[]): Outcome | null {
  if (!legalMoves(s).length) return inCheck(s) ? { kind: 'checkmate', winner: other(s.t) } : { kind: 'stalemate' };
  if (s.h >= 100) return { kind: 'fifty' };
  const key = positionKey(s);
  if (history.filter((k) => k === key).length >= 3) return { kind: 'repetition' };
  const rest = s.b.filter((p) => p && p !== 'K' && p !== 'k') as Piece[];
  if (rest.length === 0) return { kind: 'material' };
  if (rest.length === 1 && 'NnBb'.includes(rest[0])) return { kind: 'material' };
  return null;
}

// ------------------------------------------------------------------ search

const VALUE: Record<string, number> = { p: 100, n: 315, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables from white's side of the board, a8 first.
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    60, 60, 60, 60, 60, 60, 60, 60,
    14, 16, 22, 30, 30, 22, 16, 14,
    6, 8, 12, 24, 24, 12, 8, 6,
    2, 4, 8, 20, 20, 8, 4, 2,
    4, 0, -4, 4, 4, -4, 0, 4,
    4, 8, 8, -18, -18, 8, 8, 4,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -38, -30, -30, -30, -30, -38, -50,
    -38, -18, 0, 2, 2, 0, -18, -38,
    -30, 2, 12, 16, 16, 12, 2, -30,
    -30, 6, 16, 22, 22, 16, 6, -30,
    -30, 2, 16, 22, 22, 16, 2, -30,
    -30, 6, 12, 14, 14, 12, 6, -30,
    -38, -18, 0, 6, 6, 0, -18, -38,
    -50, -36, -30, -30, -30, -30, -36, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 6, 10, 10, 6, 0, -10,
    -10, 6, 6, 10, 10, 6, 6, -10,
    -10, 0, 10, 12, 12, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 6, 0, 0, 0, 0, 6, -10,
    -20, -10, -12, -10, -10, -12, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    6, 12, 12, 12, 12, 12, 12, 6,
    -4, 0, 0, 0, 0, 0, 0, -4,
    -4, 0, 0, 0, 0, 0, 0, -4,
    -4, 0, 0, 0, 0, 0, 0, -4,
    -4, 0, 0, 0, 0, 0, 0, -4,
    -4, 0, 0, 0, 0, 0, 0, -4,
    0, 0, 2, 6, 6, 2, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 4, 4, 4, 4, 0, -10,
    -5, 0, 4, 6, 6, 4, 0, -5,
    -5, 0, 4, 6, 6, 4, 0, -5,
    -10, 2, 4, 4, 4, 4, 0, -10,
    -10, 0, 2, 0, 0, 0, 0, -10,
    -20, -10, -10, -4, -4, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -24, -24, -20, -20, -10,
    16, 16, -4, -8, -8, -4, 16, 16,
    18, 28, 10, -4, 0, 8, 30, 18,
  ],
  kEnd: [
    -50, -36, -28, -20, -20, -28, -36, -50,
    -30, -18, -8, 0, 0, -8, -18, -30,
    -28, -8, 18, 26, 26, 18, -8, -28,
    -28, -8, 26, 36, 36, 26, -8, -28,
    -28, -8, 26, 36, 36, 26, -8, -28,
    -28, -8, 18, 26, 26, 18, -8, -28,
    -30, -28, 0, 0, 0, 0, -28, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

/** Score from the side to move's point of view, in centipawns. */
function evaluate(s: State): number {
  let heavy = 0;
  for (const p of s.b) if (p && !'PpKk'.includes(p)) heavy += VALUE[p.toLowerCase()];
  const endgame = heavy <= 1300;

  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = s.b[sq];
    if (!p) continue;
    const type = p.toLowerCase();
    const white = p !== type;
    const idx = white ? sq : (7 - (sq >> 3)) * 8 + (sq & 7);
    const table = type === 'k' && endgame ? PST.kEnd : PST[type];
    const v = VALUE[type] + table[idx];
    score += white ? v : -v;
  }
  return s.t === 'w' ? score : -score;
}

function moveOrder(m: Move): number {
  let score = 0;
  if (m.captured) score += 10000 + 10 * VALUE[m.captured.toLowerCase()] - VALUE[m.piece.toLowerCase()];
  if (m.promo) score += 8000 + VALUE[m.promo];
  return score;
}

const byOrder = (a: Move, b: Move) => moveOrder(b) - moveOrder(a);

const MATE = 100000;
const TIMEOUT = Symbol('timeout');
let deadline = 0;
let nodes = 0;

function tick() {
  if ((++nodes & 1023) === 0 && performance.now() > deadline) throw TIMEOUT;
}

function quiesce(s: State, alpha: number, beta: number, depth: number): number {
  tick();
  const stand = evaluate(s);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth >= 6) return alpha;
  const moves = pseudoMoves(s, true).sort(byOrder);
  for (const m of moves) {
    const next = makeMove(s, m);
    if (attacked(next.b, kingSquare(next.b, s.t), next.t)) continue;
    const score = -quiesce(next, -beta, -alpha, depth + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(s: State, depth: number, alpha: number, beta: number, ply: number): number {
  tick();
  if (depth <= 0) return quiesce(s, alpha, beta, 0);
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -MATE + ply : 0;
  if (s.h >= 100) return 0;
  moves.sort(byOrder);
  for (const m of moves) {
    const score = -negamax(makeMove(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/** Iterative deepening under a time budget. Shuffling first means equal moves vary game to game. */
export function bestMove(s: State, budgetMs = 800, maxDepth = 3): Move | null {
  const root = legalMoves(s);
  if (!root.length) return null;
  for (let i = root.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [root[i], root[j]] = [root[j], root[i]];
  }
  root.sort(byOrder);

  deadline = performance.now() + budgetMs;
  nodes = 0;
  let best = root[0];

  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -MATE * 2;
    let bestHere: Move | null = null;
    try {
      for (const m of root) {
        const score = -negamax(makeMove(s, m), depth - 1, -MATE * 2, -alpha, 1);
        if (score > alpha || !bestHere) {
          alpha = Math.max(alpha, score);
          bestHere = m;
        }
      }
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break;
    }
    if (bestHere) {
      best = bestHere;
      root.splice(root.indexOf(best), 1);
      root.unshift(best);
    }
    if (alpha > MATE - 100) break;
  }
  return best;
}
