import { TOURNEY_SCORING } from '@chess/shared';

export type Outcome = 'WIN' | 'DRAW' | 'LOSS';

export interface ScoreState {
  /** Consecutive wins immediately preceding this game. */
  streak: number;
  /** Highest streak ever reached (monitoring / tiebreak colour). */
  bestStreak: number;
}

export interface ScoreDelta extends ScoreState {
  /** Points awarded for this single game. */
  points: number;
}

/**
 * Lichess-style arena scoring. A win is worth 2, a draw 1, a loss 0. Once a
 * player has won `streakThreshold` games in a row, every further win until they
 * stop winning is worth double. Any non-win resets the streak.
 *
 * Pure and deterministic — the source of truth for the (tested) scoring rules.
 */
export function scoreGame(prev: ScoreState, outcome: Outcome): ScoreDelta {
  if (outcome === 'WIN') {
    const onFire = prev.streak >= TOURNEY_SCORING.streakThreshold;
    const points = onFire
      ? TOURNEY_SCORING.win * TOURNEY_SCORING.streakMultiplier
      : TOURNEY_SCORING.win;
    const streak = prev.streak + 1;
    return { points, streak, bestStreak: Math.max(prev.bestStreak, streak) };
  }
  if (outcome === 'DRAW') {
    return { points: TOURNEY_SCORING.draw, streak: 0, bestStreak: prev.bestStreak };
  }
  return { points: TOURNEY_SCORING.loss, streak: 0, bestStreak: prev.bestStreak };
}

/** A player is "on fire" (next win scores double) once at/above the threshold. */
export function isOnFire(streak: number): boolean {
  return streak >= TOURNEY_SCORING.streakThreshold;
}
