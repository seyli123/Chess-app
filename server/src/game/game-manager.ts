import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import {
  GAME_EVENTS,
  type Color,
  type GameResult,
  type GameState,
  type PlayerInfo,
  type Termination,
} from '@chess/shared';
import { TimeCategory } from '@prisma/client';
import { ChessEngine, type MoveInput } from './engine';
import { GameClock } from './clock/clock';
import { GameService } from './game.service';
import { RatingService } from '../rating/rating.service';

/** Abort window: if neither player makes a move within this time, abort. */
const ABORT_MS = 30_000;

interface ActiveGame {
  id: string;
  engine: ChessEngine;
  clock: GameClock;
  white: PlayerInfo;
  black: PlayerInfo;
  category: TimeCategory;
  initialSec: number;
  incrementSec: number;
  rated: boolean;
  ply: number;
  status: 'ACTIVE' | 'FINISHED' | 'ABORTED';
  result?: GameResult;
  termination?: Termination;
  drawOfferFrom?: Color;
  lastMoveAt: number;
  firstMoveMade: boolean;
  flagTimer?: NodeJS.Timeout;
  abortTimer?: NodeJS.Timeout;
}

@Injectable()
export class GameManager {
  private readonly logger = new Logger(GameManager.name);
  private readonly games = new Map<string, ActiveGame>();
  private ns?: Namespace;

  constructor(
    private readonly gameService: GameService,
    private readonly ratingService: RatingService,
  ) {}

  attachNamespace(ns: Namespace) {
    this.ns = ns;
  }

  private colorOf(g: ActiveGame, userId: string): Color | null {
    if (g.white.id === userId) return 'white';
    if (g.black.id === userId) return 'black';
    return null;
  }

  buildState(g: ActiveGame): GameState {
    const now = Date.now();
    return {
      id: g.id,
      fen: g.engine.fen,
      pgn: g.engine.pgn,
      turn: g.engine.turn,
      white: g.white,
      black: g.black,
      category: g.category,
      initialSec: g.initialSec,
      incrementSec: g.incrementSec,
      rated: g.rated,
      clock: g.clock.snapshot(now),
      status: g.status,
      result: g.result,
      termination: g.termination,
      lastMoveAt: g.lastMoveAt,
      drawOfferFrom: g.drawOfferFrom,
    };
  }

  get(gameId: string): ActiveGame | undefined {
    return this.games.get(gameId);
  }

  private broadcast(g: ActiveGame) {
    this.ns?.to(g.id).emit(GAME_EVENTS.state, this.buildState(g));
  }

  /** Create a live game (DB row + in-memory state) and return its id. */
  async createGame(params: {
    whiteId: string;
    blackId: string;
    category: TimeCategory;
    initialSec: number;
    incrementSec: number;
    rated: boolean;
  }): Promise<string> {
    const row = await this.gameService.createGame(params);
    const [whiteRating, blackRating] = await Promise.all([
      this.ratingService.getOrCreate(params.whiteId, params.category),
      this.ratingService.getOrCreate(params.blackId, params.category),
    ]);

    const g: ActiveGame = {
      id: row.id,
      engine: new ChessEngine(),
      clock: new GameClock(params.initialSec, params.incrementSec),
      white: {
        id: row.white.id,
        username: row.white.username,
        rating: Math.round(whiteRating.rating),
        color: 'white',
      },
      black: {
        id: row.black.id,
        username: row.black.username,
        rating: Math.round(blackRating.rating),
        color: 'black',
      },
      category: params.category,
      initialSec: params.initialSec,
      incrementSec: params.incrementSec,
      rated: params.rated,
      ply: 0,
      status: 'ACTIVE',
      lastMoveAt: Date.now(),
      firstMoveMade: false,
    };
    g.abortTimer = setTimeout(() => this.autoAbort(g.id), ABORT_MS);
    this.games.set(g.id, g);
    return g.id;
  }

  private clearTimers(g: ActiveGame) {
    if (g.flagTimer) clearTimeout(g.flagTimer);
    if (g.abortTimer) clearTimeout(g.abortTimer);
    g.flagTimer = undefined;
    g.abortTimer = undefined;
  }

  private scheduleFlag(g: ActiveGame) {
    if (g.flagTimer) clearTimeout(g.flagTimer);
    const ms = g.clock.msUntilFlag();
    g.flagTimer = setTimeout(() => this.handleTimeout(g.id), ms + 50);
  }

  async handleMove(gameId: string, userId: string, input: MoveInput): Promise<void> {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'ACTIVE') return;
    const color = this.colorOf(g, userId);
    if (!color) return; // spectators cannot move
    if (g.engine.turn !== color) {
      this.ns?.to(g.id).emit(GAME_EVENTS.moveRejected, { reason: 'not your turn' });
      return;
    }
    // Flag check before accepting the move.
    if (g.clock.hasFlagged()) {
      await this.handleTimeout(gameId);
      return;
    }

    const applied = g.engine.applyMove(input);
    if (!applied) {
      this.ns?.to(g.id).emit(GAME_EVENTS.moveRejected, { reason: 'illegal move' });
      return;
    }

    const now = Date.now();
    g.clock.commitMove(now);
    g.lastMoveAt = now;
    g.ply += 1;
    g.firstMoveMade = true;
    g.drawOfferFrom = undefined; // any move declines a pending draw offer
    if (g.abortTimer) {
      clearTimeout(g.abortTimer);
      g.abortTimer = undefined;
    }

    const clocks = g.clock.snapshot(now);
    await this.gameService.recordMove({
      gameId: g.id,
      ply: g.ply,
      san: applied.san,
      uci: applied.uci,
      fenAfter: applied.fenAfter,
      clockMsWhite: clocks.white,
      clockMsBlack: clocks.black,
    });

    const end = g.engine.detectEnd();
    if (end) {
      await this.endGame(g, end.result, end.termination);
      return;
    }

    this.scheduleFlag(g);
    this.broadcast(g);
  }

  private async handleTimeout(gameId: string): Promise<void> {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'ACTIVE' || !g.clock.hasFlagged()) return;
    const flagged = g.clock.onMove;
    const winner: Color = flagged === 'white' ? 'black' : 'white';
    // FIDE: if the winner cannot possibly mate, it's a draw on time.
    if (!g.engine.hasMatingMaterial(winner)) {
      await this.endGame(g, 'DRAW', 'TIMEOUT');
    } else {
      await this.endGame(g, winner === 'white' ? 'WHITE_WINS' : 'BLACK_WINS', 'TIMEOUT');
    }
  }

  async resign(gameId: string, userId: string): Promise<void> {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'ACTIVE') return;
    const color = this.colorOf(g, userId);
    if (!color) return;
    const winner: GameResult = color === 'white' ? 'BLACK_WINS' : 'WHITE_WINS';
    await this.endGame(g, winner, 'RESIGN');
  }

  async abort(gameId: string, userId: string): Promise<void> {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'ACTIVE') return;
    if (!this.colorOf(g, userId)) return;
    // Abort only allowed before the first move has been played.
    if (g.firstMoveMade) return;
    await this.endGame(g, 'DRAW', 'ABORTED');
  }

  private async autoAbort(gameId: string): Promise<void> {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'ACTIVE' || g.firstMoveMade) return;
    await this.endGame(g, 'DRAW', 'ABORTED');
  }

  offerDraw(gameId: string, userId: string): void {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'ACTIVE') return;
    const color = this.colorOf(g, userId);
    if (!color) return;
    g.drawOfferFrom = color;
    this.broadcast(g);
  }

  async acceptDraw(gameId: string, userId: string): Promise<void> {
    const g = this.games.get(gameId);
    if (!g || g.status !== 'ACTIVE' || !g.drawOfferFrom) return;
    const color = this.colorOf(g, userId);
    if (!color || color === g.drawOfferFrom) return; // can't accept your own offer
    await this.endGame(g, 'DRAW', 'DRAW_AGREED');
  }

  declineDraw(gameId: string, userId: string): void {
    const g = this.games.get(gameId);
    if (!g || !g.drawOfferFrom) return;
    const color = this.colorOf(g, userId);
    if (!color || color === g.drawOfferFrom) return;
    g.drawOfferFrom = undefined;
    this.broadcast(g);
  }

  private async endGame(g: ActiveGame, result: GameResult, termination: Termination) {
    g.status = termination === 'ABORTED' ? 'ABORTED' : 'FINISHED';
    g.result = result;
    g.termination = termination;
    this.clearTimers(g);

    let ratingChange = null;
    try {
      ratingChange = await this.gameService.finalize({
        gameId: g.id,
        result,
        termination,
        fen: g.engine.fen,
        pgn: g.engine.pgn,
        category: g.category,
        rated: g.rated,
        whiteId: g.white.id,
        blackId: g.black.id,
      });
    } catch (err) {
      this.logger.error(`Failed to finalize game ${g.id}: ${String(err)}`);
    }

    this.ns?.to(g.id).emit(GAME_EVENTS.ended, {
      ...this.buildState(g),
      ratingChange,
    });
    // Keep finished game briefly so late joiners get the final state, then evict.
    setTimeout(() => this.games.delete(g.id), 60_000);
  }
}
