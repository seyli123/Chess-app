import { Chess, Move } from 'chess.js';
import type { GameResult, Termination } from '@chess/shared';

export interface MoveInput {
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface AppliedMove {
  san: string;
  uci: string;
  fenAfter: string;
  move: Move;
}

export interface EndState {
  result: GameResult;
  termination: Termination;
}

/**
 * Thin server-authoritative wrapper around chess.js. The client never decides
 * legality — every move passes through {@link applyMove} here.
 */
export class ChessEngine {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = new Chess(fen);
  }

  get fen(): string {
    return this.chess.fen();
  }

  get pgn(): string {
    return this.chess.pgn();
  }

  get turn(): 'white' | 'black' {
    return this.chess.turn() === 'w' ? 'white' : 'black';
  }

  /** Attempts a move; returns null if illegal. */
  applyMove(input: MoveInput): AppliedMove | null {
    try {
      const move = this.chess.move({
        from: input.from,
        to: input.to,
        promotion: input.promotion ?? 'q',
      });
      if (!move) return null;
      return {
        san: move.san,
        uci: move.from + move.to + (move.promotion ?? ''),
        fenAfter: this.chess.fen(),
        move,
      };
    } catch {
      return null;
    }
  }

  /**
   * Detect a natural game end from the current position. The mover that just
   * moved is the opposite of whose turn it now is.
   */
  detectEnd(): EndState | null {
    if (this.chess.isCheckmate()) {
      // The side to move is checkmated, so the other side won.
      const result: GameResult = this.chess.turn() === 'w' ? 'BLACK_WINS' : 'WHITE_WINS';
      return { result, termination: 'CHECKMATE' };
    }
    if (this.chess.isStalemate()) return { result: 'DRAW', termination: 'STALEMATE' };
    if (this.chess.isThreefoldRepetition()) return { result: 'DRAW', termination: 'THREEFOLD' };
    if (this.chess.isInsufficientMaterial())
      return { result: 'DRAW', termination: 'INSUFFICIENT' };
    // chess.js isDraw() also covers the 50-move rule.
    if (this.chess.isDraw()) return { result: 'DRAW', termination: 'FIFTY_MOVE' };
    return null;
  }

  /** Does the given side have any material able to mate? Used at timeout. */
  hasMatingMaterial(color: 'white' | 'black'): boolean {
    const c = color === 'white' ? 'w' : 'b';
    const board = this.chess.board();
    let knights = 0;
    let bishops = 0;
    for (const row of board) {
      for (const sq of row) {
        if (!sq || sq.color !== c) continue;
        if (sq.type === 'q' || sq.type === 'r' || sq.type === 'p') return true;
        if (sq.type === 'n') knights += 1;
        if (sq.type === 'b') bishops += 1;
      }
    }
    // K+N or K+B alone cannot force mate.
    return bishops >= 2 || (bishops >= 1 && knights >= 1) || knights >= 3;
  }
}
