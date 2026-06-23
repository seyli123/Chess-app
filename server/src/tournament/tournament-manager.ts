import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import { TimeCategory } from '@prisma/client';
import {
  TOUR_EVENTS,
  type StandingRow,
  type TournamentState,
  type TournamentStatus,
} from '@chess/shared';
import { GameManager, type GameEndInfo } from '../game/game-manager';
import { RatingService } from '../rating/rating.service';
import { TournamentService } from './tournament.service';
import { scoreGame, isOnFire, type Outcome } from './scoring';

/** How often the pairing sweep runs while a tournament is live. */
const PAIR_INTERVAL_MS = 3_000;

interface TPlayer {
  userId: string;
  username: string;
  rating: number;
  score: number;
  /** Buchholz-style tiebreak: running sum of opponents' ratings. */
  performance: number;
  gamesPlayed: number;
  streak: number;
  bestStreak: number;
  withdrawn: boolean;
  /** Currently in a tournament game. */
  busy: boolean;
  lastOpponent?: string;
}

interface TState {
  id: string;
  name: string;
  category: TimeCategory;
  initialSec: number;
  incrementSec: number;
  startsAtMs: number;
  endsAtMs: number;
  status: TournamentStatus;
  players: Map<string, TPlayer>;
  /** userId -> latest watching socket (drives "present & idle" eligibility). */
  present: Map<string, Socket>;
  /** live gameId -> the pair playing it. */
  games: Map<string, { whiteId: string; blackId: string }>;
  startTimer?: NodeJS.Timeout;
  endTimer?: NodeJS.Timeout;
  pairTimer?: NodeJS.Timeout;
}

/**
 * In-memory arena engine, the tournament analogue of {@link GameManager}. Owns
 * lifecycle (scheduled -> running -> finished), continuous re-pairing of
 * present & idle entrants, and scoring of finished pairings. Persistence is
 * delegated to {@link TournamentService} so the in-memory state can be rebuilt
 * after a restart.
 */
@Injectable()
export class TournamentManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TournamentManager.name);
  private readonly states = new Map<string, TState>();
  private ns?: Namespace;

  constructor(
    private readonly tournaments: TournamentService,
    private readonly ratings: RatingService,
    private readonly games: GameManager,
  ) {}

  async onModuleInit() {
    this.games.registerEndHook((info) => this.onGameEnd(info));
    try {
      const active = await this.tournaments.loadActive();
      for (const t of active) {
        const state = await this.buildStateFromDb(t);
        this.states.set(state.id, state);
        this.scheduleLifecycle(state);
      }
      if (active.length) this.logger.log(`Loaded ${active.length} active tournament(s)`);
    } catch (err) {
      this.logger.error(`Failed to load active tournaments: ${String(err)}`);
    }
  }

  onModuleDestroy() {
    for (const state of this.states.values()) this.clearTimers(state);
  }

  attachNamespace(ns: Namespace) {
    this.ns = ns;
  }

  // ---- Construction & scheduling ----

  private async ratingFor(userId: string, category: TimeCategory): Promise<number> {
    const r = await this.ratings.getOrCreate(userId, category);
    return Math.round(r.rating);
  }

  private async buildStateFromDb(
    t: Awaited<ReturnType<TournamentService['loadActive']>>[number],
  ): Promise<TState> {
    const players = new Map<string, TPlayer>();
    await Promise.all(
      t.players.map(async (p) => {
        players.set(p.userId, {
          userId: p.userId,
          username: p.user.username,
          rating: await this.ratingFor(p.userId, t.category),
          score: p.score,
          performance: p.performance,
          gamesPlayed: p.gamesPlayed,
          streak: p.streak,
          bestStreak: p.bestStreak,
          withdrawn: p.withdrawn,
          busy: false,
        });
      }),
    );
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      initialSec: t.initialSec,
      incrementSec: t.incrementSec,
      startsAtMs: t.startsAt.getTime(),
      endsAtMs: t.startsAt.getTime() + t.durationMin * 60_000,
      status: t.status,
      players,
      present: new Map(),
      games: new Map(),
    };
  }

  /** Register a freshly created tournament so its lifecycle timers start. */
  async registerCreated(id: string): Promise<void> {
    if (this.states.has(id)) return;
    const [t] = await this.tournaments.loadActive().then((all) => all.filter((x) => x.id === id));
    if (!t) return;
    const state = await this.buildStateFromDb(t);
    this.states.set(state.id, state);
    this.scheduleLifecycle(state);
  }

  private scheduleLifecycle(state: TState) {
    const now = Date.now();
    if (state.status === 'SCHEDULED') {
      state.startTimer = setTimeout(
        () => void this.start(state),
        Math.max(0, state.startsAtMs - now),
      );
    } else if (state.status === 'RUNNING') {
      if (now >= state.endsAtMs) {
        void this.finish(state);
        return;
      }
      state.endTimer = setTimeout(() => void this.finish(state), state.endsAtMs - now);
      this.beginPairingLoop(state);
    }
  }

  private async start(state: TState) {
    if (state.status !== 'SCHEDULED') return;
    state.status = 'RUNNING';
    await this.tournaments.setStatus(state.id, 'RUNNING').catch((e) =>
      this.logger.error(`setStatus RUNNING ${state.id}: ${String(e)}`),
    );
    state.endTimer = setTimeout(
      () => void this.finish(state),
      Math.max(0, state.endsAtMs - Date.now()),
    );
    this.beginPairingLoop(state);
    this.broadcast(state);
  }

  private beginPairingLoop(state: TState) {
    if (state.pairTimer) return;
    state.pairTimer = setInterval(() => this.pair(state), PAIR_INTERVAL_MS);
    this.pair(state); // don't wait a full interval for the first pairings
  }

  private async finish(state: TState) {
    if (state.status === 'FINISHED') return;
    state.status = 'FINISHED';
    this.clearTimers(state);
    await this.tournaments.setStatus(state.id, 'FINISHED').catch((e) =>
      this.logger.error(`setStatus FINISHED ${state.id}: ${String(e)}`),
    );
    this.broadcast(state);
  }

  private clearTimers(state: TState) {
    if (state.startTimer) clearTimeout(state.startTimer);
    if (state.endTimer) clearTimeout(state.endTimer);
    if (state.pairTimer) clearInterval(state.pairTimer);
    state.startTimer = state.endTimer = state.pairTimer = undefined;
  }

  // ---- Pairing ----

  private pair(state: TState) {
    if (state.status !== 'RUNNING') return;
    if (Date.now() >= state.endsAtMs) {
      void this.finish(state);
      return;
    }
    // Eligible = registered, not withdrawn, not already playing, and present on
    // the tournament page (so we never pair someone who has navigated away).
    const avail = [...state.players.values()].filter(
      (p) => !p.withdrawn && !p.busy && state.present.has(p.userId),
    );
    // Pair adjacent in score order so similarly-scoring players meet.
    avail.sort((a, b) => b.score - a.score || b.rating - a.rating);

    for (let i = 0; i + 1 < avail.length; i += 2) {
      const a = avail[i];
      let b = avail[i + 1];
      // Avoid an immediate rematch when a third option is available.
      if (a.lastOpponent === b.userId && i + 2 < avail.length) {
        const alt = avail[i + 2];
        avail[i + 2] = b;
        avail[i + 1] = alt;
        b = alt;
      }
      void this.startPairing(state, a, b);
    }
  }

  private async startPairing(state: TState, a: TPlayer, b: TPlayer) {
    // Claim both synchronously so the next sweep can't double-book them.
    a.busy = true;
    b.busy = true;
    a.lastOpponent = b.userId;
    b.lastOpponent = a.userId;
    const [whiteId, blackId] = Math.random() < 0.5 ? [a.userId, b.userId] : [b.userId, a.userId];
    try {
      const gameId = await this.games.createGame({
        whiteId,
        blackId,
        category: state.category,
        initialSec: state.initialSec,
        incrementSec: state.incrementSec,
        rated: true,
        tournamentId: state.id,
      });
      state.games.set(gameId, { whiteId, blackId });
      state.present.get(a.userId)?.emit(TOUR_EVENTS.game, { gameId });
      state.present.get(b.userId)?.emit(TOUR_EVENTS.game, { gameId });
    } catch (err) {
      this.logger.error(`Failed to create tournament game in ${state.id}: ${String(err)}`);
      a.busy = false;
      b.busy = false;
    }
  }

  // ---- Scoring ----

  private onGameEnd(info: GameEndInfo) {
    if (!info.tournamentId) return;
    const state = this.states.get(info.tournamentId);
    if (!state) return;
    const pair = state.games.get(info.gameId);
    if (!pair) return;
    state.games.delete(info.gameId);

    const white = state.players.get(pair.whiteId);
    const black = state.players.get(pair.blackId);
    if (white) white.busy = false;
    if (black) black.busy = false;

    // Aborted games (no first move) carry no points; just free the players.
    if (info.termination !== 'ABORTED' && white && black) {
      const whiteOutcome: Outcome =
        info.result === 'WHITE_WINS' ? 'WIN' : info.result === 'BLACK_WINS' ? 'LOSS' : 'DRAW';
      const blackOutcome: Outcome =
        whiteOutcome === 'WIN' ? 'LOSS' : whiteOutcome === 'LOSS' ? 'WIN' : 'DRAW';
      this.applyScore(state, white, whiteOutcome, black.rating);
      this.applyScore(state, black, blackOutcome, white.rating);
    }
    this.broadcast(state);
  }

  private applyScore(state: TState, p: TPlayer, outcome: Outcome, oppRating: number) {
    const delta = scoreGame({ streak: p.streak, bestStreak: p.bestStreak }, outcome);
    p.score += delta.points;
    p.streak = delta.streak;
    p.bestStreak = delta.bestStreak;
    p.gamesPlayed += 1;
    p.performance += oppRating;
    void this.tournaments
      .persistPlayer(state.id, p.userId, {
        score: p.score,
        performance: p.performance,
        gamesPlayed: p.gamesPlayed,
        streak: p.streak,
        bestStreak: p.bestStreak,
      })
      .catch((e) => this.logger.error(`persistPlayer ${state.id}/${p.userId}: ${String(e)}`));
  }

  // ---- Entrants ----

  /** Add/readmit a player to a live state after they register over REST. */
  async addPlayer(tournamentId: string, userId: string, username: string): Promise<void> {
    const state = this.states.get(tournamentId);
    if (!state || state.status === 'FINISHED') return;
    const existing = state.players.get(userId);
    if (existing) {
      existing.withdrawn = false;
      this.broadcast(state);
      return;
    }
    state.players.set(userId, {
      userId,
      username,
      rating: await this.ratingFor(userId, state.category),
      score: 0,
      performance: 0,
      gamesPlayed: 0,
      streak: 0,
      bestStreak: 0,
      withdrawn: false,
      busy: false,
    });
    this.broadcast(state);
  }

  withdrawPlayer(tournamentId: string, userId: string): void {
    const p = this.states.get(tournamentId)?.players.get(userId);
    if (p) {
      p.withdrawn = true;
      this.broadcast(this.states.get(tournamentId)!);
    }
  }

  // ---- Presence & broadcasting (called by the gateway) ----

  async watch(tournamentId: string, socket: Socket, userId?: string): Promise<void> {
    socket.join(this.room(tournamentId));
    if (userId) {
      const state = this.states.get(tournamentId);
      if (state) state.present.set(userId, socket);
    }
    const snapshot = await this.snapshot(tournamentId);
    if (snapshot) socket.emit(TOUR_EVENTS.state, snapshot);
    else socket.emit(TOUR_EVENTS.error, { message: 'tournament not found' });
  }

  unwatch(tournamentId: string, socket: Socket, userId?: string): void {
    socket.leave(this.room(tournamentId));
    this.dropPresence(tournamentId, socket, userId);
  }

  /** Remove a socket's presence from every tournament it was watching. */
  handleDisconnect(socket: Socket, userId?: string): void {
    if (!userId) return;
    for (const state of this.states.values()) {
      if (state.present.get(userId) === socket) state.present.delete(userId);
    }
  }

  private dropPresence(tournamentId: string, socket: Socket, userId?: string) {
    if (!userId) return;
    const state = this.states.get(tournamentId);
    if (state && state.present.get(userId) === socket) state.present.delete(userId);
  }

  private room(id: string) {
    return `tour:${id}`;
  }

  private broadcast(state: TState) {
    this.ns?.to(this.room(state.id)).emit(TOUR_EVENTS.state, this.buildState(state));
  }

  private buildState(state: TState): TournamentState {
    const now = Date.now();
    return {
      id: state.id,
      name: state.name,
      category: state.category,
      initialSec: state.initialSec,
      incrementSec: state.incrementSec,
      status: state.status,
      startsAt: new Date(state.startsAtMs).toISOString(),
      secondsToStart:
        state.status === 'SCHEDULED' ? Math.max(0, Math.round((state.startsAtMs - now) / 1000)) : 0,
      secondsRemaining:
        state.status === 'RUNNING' ? Math.max(0, Math.round((state.endsAtMs - now) / 1000)) : 0,
      standings: this.standings(state),
    };
  }

  private standings(state: TState): StandingRow[] {
    return [...state.players.values()]
      .sort(
        (a, b) =>
          b.score - a.score || b.performance - a.performance || b.rating - a.rating,
      )
      .map((p, i) => ({
        userId: p.userId,
        username: p.username,
        rating: p.rating,
        score: p.score,
        gamesPlayed: p.gamesPlayed,
        streak: p.streak,
        onFire: isOnFire(p.streak),
        withdrawn: p.withdrawn,
        rank: i + 1,
      }));
  }

  /**
   * A one-off state snapshot for a watcher. Uses live in-memory state when the
   * tournament is loaded, otherwise reads the finished result straight from the
   * database so finished events still render.
   */
  private async snapshot(tournamentId: string): Promise<TournamentState | null> {
    const state = this.states.get(tournamentId);
    if (state) return this.buildState(state);

    const t = await this.tournaments.getWithPlayers(tournamentId);
    if (!t) return null;
    const standings: StandingRow[] = await Promise.all(
      t.players
        .slice()
        .sort((a, b) => b.score - a.score || b.performance - a.performance)
        .map(async (p, i) => ({
          userId: p.userId,
          username: p.user.username,
          rating: await this.ratingFor(p.userId, t.category),
          score: p.score,
          gamesPlayed: p.gamesPlayed,
          streak: p.streak,
          onFire: isOnFire(p.streak),
          withdrawn: p.withdrawn,
          rank: i + 1,
        })),
    );
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      initialSec: t.initialSec,
      incrementSec: t.incrementSec,
      status: t.status,
      startsAt: t.startsAt.toISOString(),
      secondsToStart: 0,
      secondsRemaining: 0,
      standings,
    };
  }
}
