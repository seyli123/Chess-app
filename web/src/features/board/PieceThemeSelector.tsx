import { PIECE_THEMES, usePieceTheme, type PieceTheme } from '../../lib/pieceTheme';

/** Dropdown to switch the board's piece set; persisted via PieceThemeProvider. */
export function PieceThemeSelector({ className = '' }: { className?: string }) {
  const { theme, setTheme } = usePieceTheme();
  return (
    <label className={`flex items-center gap-2 text-sm text-slate-400 ${className}`}>
      <span>Pieces</span>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as PieceTheme)}
        className="rounded bg-slate-800 px-2 py-1 text-slate-100 hover:bg-slate-700"
      >
        {PIECE_THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
