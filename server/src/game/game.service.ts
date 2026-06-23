import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { GameResult, Termination, TimeCategory } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RatingService, RatingChange } from '../rating/rating.service';

const START_FEN = new Chess().fen();

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rating: RatingService,
  ) {}

  async createGame(params: {
    whiteId: string;
    blackId: string;
    category: TimeCategory;
    initialSec: number;
    incrementSec: number;
    rated: boolean;
    tournamentId?: string;
  }) {
    return this.prisma.game.create({
      data: {
        whiteId: params.whiteId,
        blackId: params.blackId,
        category: params.category,
        initialSec: params.initialSec,
        incrementSec: params.incrementSec,
        rated: params.rated,
        tournamentId: params.tournamentId ?? null,
        fen: START_FEN,
      },
      include: { white: true, black: true },
    });
  }

  async recordMove(params: {
    gameId: string;
    ply: number;
    san: string;
    uci: string;
    fenAfter: string;
    clockMsWhite: number;
    clockMsBlack: number;
  }) {
    await this.prisma.move.create({ data: params });
  }

  /**
   * Persist the final result and, for rated games, update both Glicko-2 ratings
   * atomically in a single transaction.
   */
  async finalize(params: {
    gameId: string;
    result: GameResult;
    termination: Termination;
    fen: string;
    pgn: string;
    category: TimeCategory;
    rated: boolean;
    whiteId: string;
    blackId: string;
  }): Promise<RatingChange | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.game.update({
        where: { id: params.gameId },
        data: {
          status: params.termination === 'ABORTED' ? 'ABORTED' : 'FINISHED',
          result: params.result,
          termination: params.termination,
          fen: params.fen,
          pgn: params.pgn,
          endedAt: new Date(),
        },
      });

      if (!params.rated || params.termination === 'ABORTED') return null;

      const whiteScore =
        params.result === 'WHITE_WINS' ? 1 : params.result === 'BLACK_WINS' ? 0 : 0.5;
      return this.rating.applyResult(
        tx,
        params.whiteId,
        params.blackId,
        params.category,
        whiteScore,
      );
    });
  }

  getGame(id: string) {
    return this.prisma.game.findUnique({
      where: { id },
      include: { white: true, black: true, moves: { orderBy: { ply: 'asc' } } },
    });
  }

  getUserGames(userId: string, take = 30) {
    return this.prisma.game.findMany({
      where: { OR: [{ whiteId: userId }, { blackId: userId }], status: { not: 'ACTIVE' } },
      include: { white: true, black: true },
      orderBy: { startedAt: 'desc' },
      take,
    });
  }

  listActive(take = 30) {
    return this.prisma.game.findMany({
      where: { status: 'ACTIVE' },
      include: { white: true, black: true },
      orderBy: { startedAt: 'desc' },
      take,
    });
  }
}
