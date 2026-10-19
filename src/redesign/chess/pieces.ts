// Flat, screen-printed chess pieces on a 100×100 grid. `body` takes the fill and outline,
// `detail` (the bishop's slit, the knight's eye) takes the contrasting ink.

const BASE = 'M24 80h52a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z';

export const PIECES: Record<string, { body: string; detail?: string }> = {
  p: {
    body: `M50 16a12 12 0 1 1 0 24a12 12 0 1 1 0-24z M38 44h24l-3 6H41z M42 50c0 12-5 21-10 30h36c-5-9-10-18-10-30z ${BASE}`,
  },
  r: {
    body: `M28 14h9v8h7v-8h12v8h7v-8h9v18l-7 6H35l-7-6z M36 40h28l3 40H33z ${BASE}`,
  },
  n: {
    body: `M30 80c0-12 5-20 12-26l-12-1c-6 0-9-5-8-10l1-3c1-4 4-6 8-8l13-8 2-8 6 5 4-8c12 4 20 18 20 34 0 12-5 20-6 33z ${BASE}`,
    detail: 'M46 31.5a3.2 3.2 0 1 1-6.4 0a3.2 3.2 0 1 1 6.4 0z M29 42a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0z',
  },
  b: {
    body: `M50 7.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11z M50 20c-13 9-17 22-11 34h22c6-12 2-25-11-34z M37 56h26v6H37z M40 62c0 7-4 13-8 18h36c-4-5-8-11-8-18z ${BASE}`,
    detail: 'M56 27l3.2 2.2-10 14-3.2-2.2z',
  },
  q: {
    body:
      'M24 19a5 5 0 1 1 0 10a5 5 0 1 1 0-10z M36 9a5 5 0 1 1 0 10a5 5 0 1 1 0-10z M50 5a5 5 0 1 1 0 10a5 5 0 1 1 0-10z ' +
      'M64 9a5 5 0 1 1 0 10a5 5 0 1 1 0-10z M76 19a5 5 0 1 1 0 10a5 5 0 1 1 0-10z ' +
      `M24 28l8 16 4-26 7 22 7-26 7 26 7-22 4 26 8-16-9 30H33z M33 58h34l-2 7H35z M36 65c0 6-3 11-6 15h40c-3-4-6-9-6-15z ${BASE}`,
  },
  k: {
    body: `M46 6h8v7h7v7h-7v13h-8V20h-7v-7h7z M28 38c0-9 10-12 22-6 12-6 22-3 22 6 0 10-8 16-8 22H36c0-6-8-12-8-22z M35 60h30l-2 7H37z M38 67c0 5-3 9-6 13h36c-3-4-6-8-6-13z ${BASE}`,
  },
};

export function pieceMarkup(type: string, side: 'w' | 'b', className = 'pc'): string {
  const p = PIECES[type];
  const detail = p.detail ? `<path class="pd" d="${p.detail}"/>` : '';
  return `<svg class="${className} pc-${side}" viewBox="0 0 100 100" aria-hidden="true"><path class="pf" d="${p.body}"/>${detail}</svg>`;
}
