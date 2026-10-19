// Mort's search, off the main thread, so the board stays live while he thinks.
// The page posts a position; the worker posts back the move it settled on.

import { bestMove, type Move, type State } from './engine';

export interface SearchRequest {
  /** Echoed back so the page can drop replies for positions that are gone. */
  id: number;
  state: State;
  budgetMs: number;
  maxDepth: number;
}

export interface SearchReply {
  id: number;
  move: Move | null;
}

addEventListener('message', (e: MessageEvent<SearchRequest>) => {
  const { id, state, budgetMs, maxDepth } = e.data;
  const reply: SearchReply = { id, move: bestMove(state, budgetMs, maxDepth) };
  postMessage(reply);
});
