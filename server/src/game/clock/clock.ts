import type { Color } from '@chess/shared';

/**
 * Server-authoritative chess clock. The server is the single source of truth
 * for time: the client only renders the values it receives. Elapsed time is
 * charged to the side that was on move when a move actually lands on the server,
 * which naturally compensates for network latency (a player is never charged
 * for the time their packet spends in flight after they release the piece —
 * we charge wall-clock between the previous landed move and this one).
 */
export class GameClock {
  private remaining: Record<Color, number>;
  private readonly incrementMs: number;
  private turn: Color;
  private lastTickAt: number;
  /** Set once the first move is made; before that, no time is charged. */
  private running = false;

  constructor(initialSec: number, incrementSec: number, now = Date.now()) {
    this.remaining = { white: initialSec * 1000, black: initialSec * 1000 };
    this.incrementMs = incrementSec * 1000;
    this.turn = 'white';
    this.lastTickAt = now;
  }

  /** Remaining ms for both sides as of `now`, accounting for the live tick. */
  snapshot(now = Date.now()): { white: number; black: number } {
    const r = { ...this.remaining };
    if (this.running) {
      r[this.turn] = Math.max(0, r[this.turn] - (now - this.lastTickAt));
    }
    return r;
  }

  /** Whose clock is currently ticking. */
  get onMove(): Color {
    return this.turn;
  }

  /** True if the side on move has flagged as of `now`. */
  hasFlagged(now = Date.now()): boolean {
    if (!this.running) return false;
    return this.remaining[this.turn] - (now - this.lastTickAt) <= 0;
  }

  /** Milliseconds until the side on move flags (for scheduling the timer). */
  msUntilFlag(now = Date.now()): number {
    const used = this.running ? now - this.lastTickAt : 0;
    return Math.max(0, this.remaining[this.turn] - used);
  }

  /**
   * Commit a completed move by the side on move: charge their elapsed time,
   * add the increment, then hand the clock to the opponent.
   */
  commitMove(now = Date.now()): void {
    if (this.running) {
      const elapsed = now - this.lastTickAt;
      this.remaining[this.turn] = Math.max(0, this.remaining[this.turn] - elapsed);
      // Increment only granted if they had time left.
      if (this.remaining[this.turn] > 0) {
        this.remaining[this.turn] += this.incrementMs;
      }
    } else {
      // First move of the game starts the clock.
      this.running = true;
    }
    this.turn = this.turn === 'white' ? 'black' : 'white';
    this.lastTickAt = now;
  }
}
