export type TimeCategory = 'BULLET' | 'BLITZ' | 'RAPID';

export interface TimeControl {
  /** Stable id, e.g. "blitz_3_2" */
  id: string;
  label: string;
  category: TimeCategory;
  /** Base time in seconds */
  initialSec: number;
  /** Increment per move in seconds */
  incrementSec: number;
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: 'bullet_1_0', label: '1+0', category: 'BULLET', initialSec: 60, incrementSec: 0 },
  { id: 'bullet_2_1', label: '2+1', category: 'BULLET', initialSec: 120, incrementSec: 1 },
  { id: 'blitz_3_0', label: '3+0', category: 'BLITZ', initialSec: 180, incrementSec: 0 },
  { id: 'blitz_3_2', label: '3+2', category: 'BLITZ', initialSec: 180, incrementSec: 2 },
  { id: 'blitz_5_0', label: '5+0', category: 'BLITZ', initialSec: 300, incrementSec: 0 },
  { id: 'rapid_10_0', label: '10+0', category: 'RAPID', initialSec: 600, incrementSec: 0 },
  { id: 'rapid_15_10', label: '15+10', category: 'RAPID', initialSec: 900, incrementSec: 10 },
];

export const TIME_CONTROL_BY_ID: Record<string, TimeControl> = Object.fromEntries(
  TIME_CONTROLS.map((tc) => [tc.id, tc]),
);

/**
 * Lichess-style categorisation by estimated game duration
 * (base + 40 * increment). Used as a fallback; the canonical category for a
 * known control comes from TIME_CONTROL_BY_ID.
 */
export function categoryForControl(initialSec: number, incrementSec: number): TimeCategory {
  const estimated = initialSec + 40 * incrementSec;
  if (estimated < 179) return 'BULLET';
  if (estimated < 479) return 'BLITZ';
  return 'RAPID';
}
