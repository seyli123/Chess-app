import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import { Chess, SQUARES } from 'chess.js';
import type { Color } from '@chess/shared';
import { useSettings } from '../../lib/settings';

export interface BoardProps {
  fen: string;
  orientation: Color;
  turn: Color;
  /**
   * The client's own colour when interaction is allowed at the live position
   * (enables real moves and premoves). Undefined => view-only.
   */
  playerColor?: Color;
  /** True when it's the player's turn (real move); false => premove mode. */
  myTurn?: boolean;
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

export function Board({
  fen,
  orientation,
  turn,
  playerColor,
  myTurn,
  lastMove,
  onMove,
}: BoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { pieceTheme, boardTheme } = useSettings();

  useEffect(() => {
    if (!ref.current) return;
    const config: Config = {
      fen,
      orientation,
      turnColor: turn,
      coordinates: true,
      movable: { free: false, color: playerColor, dests: computeDests(fen) },
    };
    apiRef.current = Chessground(ref.current, config);
    return () => apiRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const canMoveNow = !!playerColor && !!myTurn;
    const canPremove = !!playerColor && !myTurn;
    api.set({
      fen,
      orientation,
      turnColor: turn,
      lastMove: lastMove as Key[] | undefined,
      movable: {
        free: false,
        // Keep the player's colour set during the opponent's turn so they can
        // grab a piece to queue a premove (color !== turnColor => premove).
        color: playerColor,
        dests: canMoveNow ? computeDests(fen) : new Map(),
        events: {
          after: (from: Key, to: Key) => {
            // Always promote to queen in this slice; a promotion picker is a TODO.
            onMove?.(from, to, 'q');
          },
        },
      },
      premovable: { enabled: canPremove, showDests: true },
    });
    // When it becomes our turn, flush any queued premove (illegal ones are
    // dropped silently by chessground). Otherwise clear stale premoves when the
    // board goes view-only (game ended / reviewing history).
    if (canMoveNow) api.playPremove();
    else if (!canPremove) api.cancelPremove();
  }, [fen, orientation, turn, playerColor, myTurn, lastMove, onMove]);

  // Escape cancels a queued premove.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') apiRef.current?.cancelPremove();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="w-full max-w-[560px]">
      {/* theme-<set> selects the piece SVGs (src/pieces.css); board-<id> the
          square colours (src/board-themes.css). */}
      <div ref={ref} className={`cg-wrap theme-${pieceTheme} board-${boardTheme}`} />
    </div>
  );
}
