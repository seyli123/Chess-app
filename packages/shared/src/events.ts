import type { TimeCategory } from './time-controls';

export type Color = 'white' | 'black';
export type GameResult = 'WHITE_WINS' | 'BLACK_WINS' | 'DRAW';
export type Termination =
  | 'CHECKMATE'
  | 'RESIGN'
  | 'TIMEOUT'
  | 'STALEMATE'
  | 'THREEFOLD'
  | 'FIFTY_MOVE'
  | 'INSUFFICIENT'
  | 'DRAW_AGREED'
  | 'ABORTED';

export interface PlayerInfo {
  id: string;
  username: string;
  rating: number;
  color: Color;
}

/** Authoritative game snapshot sent by the server. */
export interface GameState {
  id: string;
  fen: string;
  pgn: string;
  turn: Color;
  white: PlayerInfo;
  black: PlayerInfo;
  category: TimeCategory;
  initialSec: number;
  incrementSec: number;
  rated: boolean;
  /** Remaining clock in milliseconds, server-authoritative. */
  clock: { white: number; black: number };
  status: 'ACTIVE' | 'FINISHED' | 'ABORTED';
  result?: GameResult;
  termination?: Termination;
  /** Server timestamp (ms) when this snapshot's clock was last accounted. */
  lastMoveAt: number;
  drawOfferFrom?: Color;
  /** Set when this game is a pairing inside an arena tournament. */
  tournamentId?: string;
  /** Per-player wager in tokens (0 = unwagered). Pot is 2x this. */
  wager?: number;
}

// ---- Matchmaking namespace (/matchmaking) ----
export interface MmJoinPayload {
  timeControlId: string;
  /** Optional rating window; server clamps. */
  ratingRange?: number;
  /** Per-player wager in tokens. Server clamps to [0, maxWager]. */
  wager?: number;
}
export interface MmMatchedPayload {
  gameId: string;
}

export const MM_EVENTS = {
  join: 'mm:join',
  leave: 'mm:leave',
  queued: 'mm:queued',
  matched: 'mm:matched',
  error: 'mm:error',
} as const;

// ---- Game namespace (/game) ----
export interface MovePayload {
  gameId: string;
  /** UCI or {from,to,promotion}. We accept SAN too server-side. */
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export const GAME_EVENTS = {
  join: 'game:join',          // join as player or spectator
  spectate: 'game:spectate',
  move: 'game:move',
  resign: 'game:resign',
  offerDraw: 'game:offerDraw',
  acceptDraw: 'game:acceptDraw',
  declineDraw: 'game:declineDraw',
  abort: 'game:abort',
  // rematch (client -> server)
  rematchOffer: 'game:rematchOffer',
  rematchCancel: 'game:rematchCancel',
  // server -> client
  state: 'game:state',
  moveRejected: 'game:moveRejected',
  ended: 'game:ended',
  clock: 'game:clock',
  error: 'game:error',
  // rematch (server -> client)
  rematchOffered: 'game:rematchOffered',
  rematchCanceled: 'game:rematchCanceled',
  rematchReady: 'game:rematchReady',
  rematchExpired: 'game:rematchExpired',
  rematchError: 'game:rematchError',
} as const;

/** Seconds a rematch offer stays open before it expires. */
export const REMATCH_TTL_SEC = 30;
