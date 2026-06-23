import {
  PIECE_THEMES,
  BOARD_THEMES,
  useSettings,
  type BoardTheme,
} from '../../lib/settings';
import { Board } from '../board/Board';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Pieces shown as a preview on each piece-set card. */
const PREVIEW_PIECES = ['wK', 'wN', 'bQ', 'bP'];

function BoardSwatch({ theme }: { theme: { light: string; dark: string } }) {
  // 2x2 mini checkerboard: light / dark / dark / light.
  const cells = [theme.light, theme.dark, theme.dark, theme.light];
  return (
    <div className="grid h-10 w-10 grid-cols-2 overflow-hidden rounded">
      {cells.map((c, i) => (
        <div key={i} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

export function SettingsPage() {
  const { pieceTheme, setPieceTheme, boardTheme, setBoardTheme } = useSettings();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
        {/* Choices */}
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Piece set</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PIECE_THEMES.map((t) => {
                const selected = t.id === pieceTheme;
                return (
                  <button
                    key={t.id}
                    onClick={() => setPieceTheme(t.id)}
                    aria-pressed={selected}
                    className={`rounded-lg border-2 p-3 text-left transition ${
                      selected
                        ? 'border-emerald-500 bg-slate-800'
                        : 'border-transparent bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-1">
                      {PREVIEW_PIECES.map((p) => (
                        <img
                          key={p}
                          src={`/pieces/${t.id}/${p}.svg`}
                          alt=""
                          width={34}
                          height={34}
                          className="h-8 w-8"
                        />
                      ))}
                    </div>
                    <div className="text-sm">{t.label}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Board colour</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BOARD_THEMES.map((t) => {
                const selected = t.id === boardTheme;
                return (
                  <button
                    key={t.id}
                    onClick={() => setBoardTheme(t.id as BoardTheme)}
                    aria-pressed={selected}
                    className={`flex items-center gap-3 rounded-lg border-2 p-3 transition ${
                      selected
                        ? 'border-emerald-500 bg-slate-800'
                        : 'border-transparent bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    <BoardSwatch theme={t} />
                    <span className="text-sm">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <p className="text-xs text-slate-500">
            Preferences are saved to this browser and apply to every board in the app.
          </p>
        </div>

        {/* Live preview */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Preview</h2>
          <Board fen={START_FEN} orientation="white" turn="white" />
        </div>
      </div>
    </div>
  );
}
