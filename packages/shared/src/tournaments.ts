import type { TimeCategory } from './time-controls';

export type TournamentStatus = 'SCHEDULED' | 'RUNNING' | 'FINISHED';

/** Arena scoring (Lichess-style). */
export const TOURNEY_SCORING = {
  win: 2,
  draw: 1,
  loss: 0,
  /**
   * Consecutive wins needed before the *next* win starts scoring double. A
   * player "on fire" (>= this many prior wins) earns `win * streakMultiplier`
   * per win until they fail to win.
   */
  streakThreshold: 2,
  streakMultiplier: 2,
} as const;

export interface TournamentSummary {
  id: string;
  name: string;
  category: TimeCategory;
  initialSec: number;
  incrementSec: number;
  startsAt: string; // ISO
  durationMin: number;
  status: TournamentStatus;
  playerCount: number;
}

export interface StandingRow {
  userId: string;
  username: string;
  rating: number;
  score: number;
  gamesPlayed: number;
  streak: number;
  /** True while the player is currently "on fire" (wins worth double). */
  onFire: boolean;
  withdrawn: boolean;
  rank: number;
}

/** Real-time tournament snapshot pushed over the /tournament namespace. */
export interface TournamentState {
  id: string;
  name: string;
  category: TimeCategory;
  initialSec: number;
  incrementSec: number;
  status: TournamentStatus;
  startsAt: string;
  /** Seconds until start (if SCHEDULED) or until end (if RUNNING); 0 otherwise. */
  secondsToStart: number;
  secondsRemaining: number;
  standings: StandingRow[];
}

// ---- Tournament namespace (/tournament) ----
export interface TourWatchPayload {
  tournamentId: string;
}

export const TOUR_EVENTS = {
  // client -> server
  watch: 'tour:watch',
  unwatch: 'tour:unwatch',
  // server -> client
  state: 'tour:state',
  /** Sent to a player when they have been paired; navigate to the game. */
  game: 'tour:game',
  error: 'tour:error',
} as const;
