import { Chess } from 'chess.js';

export type PieceRole = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface HistoryEntry {
  /** SAN of the move that produced this position ('' for the start position). */
  san: string;
  /** FEN of the position at this ply. */
  fen: string;
  /** [from, to] of the move that produced this position (for highlighting). */
  lastMove?: [string, string];
  /** Side that moved into this position. */
  color?: 'w' | 'b';
  /** Role of any piece captured by this move. */
  captured?: PieceRole;
}

const START_FEN = new Chess().fen();

/** Standard piece values for the material count. */
export const PIECE_VALUES: Record<PieceRole, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Parse a PGN into a per-ply list of positions, starting with the initial
 * position at index 0. Robust to an empty/invalid PGN (returns just the start).
 */
export function parseHistory(pgn: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [{ san: '', fen: START_FEN }];
  if (!pgn || !pgn.trim()) return entries;
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return entries;
  }
  for (const m of chess.history({ verbose: true })) {
    entries.push({
      san: m.san,
      fen: m.after,
      lastMove: [m.from, m.to],
      color: m.color,
      captured: m.captured as PieceRole | undefined,
    });
  }
  return entries;
}

export interface MaterialState {
  /** Black pieces captured by White, sorted by value (high first). */
  capturedByWhite: PieceRole[];
  /** White pieces captured by Black, sorted by value (high first). */
  capturedByBlack: PieceRole[];
  /** Positive => White is ahead by this many points; negative => Black. */
  advantage: number;
}

const byValueDesc = (a: PieceRole, b: PieceRole) => PIECE_VALUES[b] - PIECE_VALUES[a];

/** Captured pieces and material balance for the position at `cursor` plies. */
export function materialAt(history: HistoryEntry[], cursor: number): MaterialState {
  const capturedByWhite: PieceRole[] = [];
  const capturedByBlack: PieceRole[] = [];
  for (let i = 1; i <= cursor && i < history.length; i++) {
    const e = history[i];
    if (!e.captured) continue;
    if (e.color === 'w') capturedByWhite.push(e.captured);
    else capturedByBlack.push(e.captured);
  }
  const sum = (roles: PieceRole[]) => roles.reduce((s, r) => s + PIECE_VALUES[r], 0);
  capturedByWhite.sort(byValueDesc);
  capturedByBlack.sort(byValueDesc);
  return {
    capturedByWhite,
    capturedByBlack,
    advantage: sum(capturedByWhite) - sum(capturedByBlack),
  };
}
