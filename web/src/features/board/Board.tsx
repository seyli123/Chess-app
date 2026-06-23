import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import { Chess, SQUARES } from 'chess.js';
import type { Color } from '@chess/shared';
import { usePieceTheme } from '../../lib/pieceTheme';

export interface BoardProps {
  fen: string;
  orientation: Color;
  /** Side this client is allowed to move; undefined => view only. */
  movableColor?: Color;
  turn: Color;
  lastMove?: [string, string];
  onMove?: (from: string, to: string, promotion?: string) => void;
}

/** Build chessground's legal-destination map from a FEN using chess.js. */
function computeDests(fen: string): Map<Key, Key[]> {
  const chess = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  for (const square of SQUARES) {
    const moves = chess.moves({ square, verbose: true });
    if (moves.length) dests.set(square as Key, moves.map((m) => m.to as Key));
  }
  return dests;
}

export function Board({ fen, orientation, movableColor, turn, lastMove, onMove }: BoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { theme } = usePieceTheme();

  useEffect(() => {
    if (!ref.current) return;
    const config: Config = {
      fen,
      orientation,
      turnColor: turn,
      coordinates: true,
      movable: { free: false, color: movableColor, dests: computeDests(fen) },
    };
    apiRef.current = Chessground(ref.current, config);
    return () => apiRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.set({
      fen,
      orientation,
      turnColor: turn,
      lastMove: lastMove as Key[] | undefined,
      movable: {
        free: false,
        color: movableColor,
        dests: movableColor ? computeDests(fen) : new Map(),
        events: {
          after: (from: Key, to: Key) => {
            // Always promote to queen in this slice; a promotion picker is a TODO.
            onMove?.(from, to, 'q');
          },
        },
      },
    });
  }, [fen, orientation, movableColor, turn, lastMove, onMove]);

  return (
    <div className="w-full max-w-[560px]">
      {/* The theme-<set> class selects the piece SVGs (see src/pieces.css). */}
      <div ref={ref} className={`cg-wrap theme-${theme}`} />
    </div>
  );
}
