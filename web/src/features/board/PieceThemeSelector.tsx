import { Link } from 'react-router-dom';
import { PIECE_THEMES, useSettings, type PieceTheme } from '../../lib/settings';

/**
 * Compact in-game piece-set switcher. Full theme options (board colours, visual
 * previews) live on the Settings page, linked here.
 */
export function PieceThemeSelector({ className = '' }: { className?: string }) {
  const { pieceTheme, setPieceTheme } = useSettings();
  return (
    <label className={`flex items-center gap-2 text-sm text-slate-400 ${className}`}>
      <span>Pieces</span>
      <select
        value={pieceTheme}
        onChange={(e) => setPieceTheme(e.target.value as PieceTheme)}
        className="rounded bg-slate-800 px-2 py-1 text-slate-100 hover:bg-slate-700"
      >
        {PIECE_THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <Link to="/settings" className="text-xs text-slate-500 hover:text-emerald-400" title="More themes">
        ⚙
      </Link>
    </label>
  );
}
