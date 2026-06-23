import type { Color } from '@chess/shared';
import { useSettings } from '../../lib/settings';
import type { MaterialState, PieceRole } from './history';

/**
 * Captured pieces and material lead for one player. A player's captures are the
 * opponent's pieces, so they render in the opposite colour using the active
 * piece theme. The +N badge shows only for the side that is ahead.
 */
export function CapturedPanel({ side, material }: { side: Color; material: MaterialState }) {
  const { pieceTheme } = useSettings();
  const pieces: PieceRole[] =
    side === 'white' ? material.capturedByWhite : material.capturedByBlack;
  const pieceColor = side === 'white' ? 'b' : 'w'; // captured pieces are the opponent's
  const lead = side === 'white' ? material.advantage : -material.advantage;

  return (
    <div className="flex h-5 items-center gap-px">
      {pieces.map((role, i) => (
        <img
          key={i}
          src={`/pieces/${pieceTheme}/${pieceColor}${role.toUpperCase()}.svg`}
          alt={role}
          className="h-4 w-4"
        />
      ))}
      {lead > 0 && <span className="ml-1 text-xs font-medium text-slate-300">+{lead}</span>}
    </div>
  );
}
