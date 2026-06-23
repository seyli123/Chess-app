import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Available piece themes. Keep in sync with scripts/gen-pieces-css.mjs. */
export const PIECE_THEMES = [
  { id: 'cburnett', label: 'Cburnett — default' },
  { id: 'merida', label: 'Merida — classic' },
  { id: 'alpha', label: 'Alpha — minimal' },
  { id: 'california', label: 'California — illustrated' },
  { id: 'gioco', label: 'Gioco — modern' },
] as const;

export type PieceTheme = (typeof PIECE_THEMES)[number]['id'];

/**
 * Available board colours. The light/dark hexes are mirrored in
 * src/board-themes.css (the actual board rendering) and reused here for the
 * settings-page swatches — keep the two in sync.
 */
export const BOARD_THEMES = [
  { id: 'brown', label: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'green', label: 'Green', light: '#ebecd0', dark: '#769656' },
  { id: 'blue', label: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'grey', label: 'Grey', light: '#e8e8e8', dark: '#9e9e9e' },
] as const;

export type BoardTheme = (typeof BOARD_THEMES)[number]['id'];

const KEYS = {
  piece: 'chess.pieceTheme',
  board: 'chess.boardTheme',
} as const;

const DEFAULTS = {
  piece: 'cburnett' as PieceTheme,
  board: 'brown' as BoardTheme,
};

function load<T extends string>(key: string, valid: readonly { id: string }[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored && valid.some((v) => v.id === stored)) return stored as T;
  } catch {
    // localStorage unavailable (private mode / SSR) — fall back to default.
  }
  return fallback;
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore write failures (storage disabled / quota)
  }
}

interface SettingsContextValue {
  pieceTheme: PieceTheme;
  setPieceTheme: (theme: PieceTheme) => void;
  boardTheme: BoardTheme;
  setBoardTheme: (theme: BoardTheme) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  pieceTheme: DEFAULTS.piece,
  setPieceTheme: () => undefined,
  boardTheme: DEFAULTS.board,
  setBoardTheme: () => undefined,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [pieceTheme, setPieceState] = useState<PieceTheme>(() =>
    load(KEYS.piece, PIECE_THEMES, DEFAULTS.piece),
  );
  const [boardTheme, setBoardState] = useState<BoardTheme>(() =>
    load(KEYS.board, BOARD_THEMES, DEFAULTS.board),
  );

  useEffect(() => save(KEYS.piece, pieceTheme), [pieceTheme]);
  useEffect(() => save(KEYS.board, boardTheme), [boardTheme]);

  const setPieceTheme = (next: PieceTheme) => {
    if (PIECE_THEMES.some((t) => t.id === next)) setPieceState(next);
  };
  const setBoardTheme = (next: BoardTheme) => {
    if (BOARD_THEMES.some((t) => t.id === next)) setBoardState(next);
  };

  return (
    <SettingsContext.Provider value={{ pieceTheme, setPieceTheme, boardTheme, setBoardTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
