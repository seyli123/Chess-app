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

const STORAGE_KEY = 'chess.pieceTheme';
const DEFAULT_THEME: PieceTheme = 'cburnett';

function isValid(value: string | null): value is PieceTheme {
  return !!value && PIECE_THEMES.some((t) => t.id === value);
}

function loadTheme(): PieceTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValid(stored)) return stored;
  } catch {
    // localStorage unavailable (private mode / SSR) — fall back to default.
  }
  return DEFAULT_THEME;
}

interface PieceThemeContextValue {
  theme: PieceTheme;
  setTheme: (theme: PieceTheme) => void;
}

const PieceThemeContext = createContext<PieceThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => undefined,
});

export function PieceThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<PieceTheme>(loadTheme);

  // Persist whenever the choice changes so it survives reloads.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore write failures (storage disabled / quota)
    }
  }, [theme]);

  const setTheme = (next: PieceTheme) => {
    if (isValid(next)) setThemeState(next);
  };

  return (
    <PieceThemeContext.Provider value={{ theme, setTheme }}>{children}</PieceThemeContext.Provider>
  );
}

export const usePieceTheme = () => useContext(PieceThemeContext);
