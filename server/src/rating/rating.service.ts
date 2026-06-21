import { Injectable } from '@nestjs/common';
import { Prisma, TimeCategory } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { updateGlicko } from './glicko2';

export interface RatingChange {
  white: { before: number; after: number };
  black: { before: number; after: number };
}

@Injectable()
export class RatingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fetch (or lazily default) a player's rating row for a category. */
  async getOrCreate(userId: string, category: TimeCategory) {
    return this.prisma.rating.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category },
      update: {},
    });
  }

  /**
   * Apply a finished rated game's result to both players' Glicko-2 ratings.
   * Runs inside the supplied transaction so it commits atomically with the
   * game result. `whiteScore` is 1 / 0.5 / 0 from White's perspective.
   */
  async applyResult(
    tx: Prisma.TransactionClient,
    whiteId: string,
    blackId: string,
    category: TimeCategory,
    whiteScore: number,
  ): Promise<RatingChange> {
    const white = await tx.rating.upsert({
      where: { userId_category: { userId: whiteId, category } },
      create: { userId: whiteId, category },
      update: {},
    });
    const black = await tx.rating.upsert({
      where: { userId_category: { userId: blackId, category } },
      create: { userId: blackId, category },
      update: {},
    });

    const newWhite = updateGlicko(
      { rating: white.rating, deviation: white.deviation, volatility: white.volatility },
      [{ rating: black.rating, deviation: black.deviation, score: whiteScore }],
    );
    const newBlack = updateGlicko(
      { rating: black.rating, deviation: black.deviation, volatility: black.volatility },
      [{ rating: white.rating, deviation: white.deviation, score: 1 - whiteScore }],
    );

    await tx.rating.update({
      where: { userId_category: { userId: whiteId, category } },
      data: {
        rating: newWhite.rating,
        deviation: newWhite.deviation,
        volatility: newWhite.volatility,
        gamesPlayed: { increment: 1 },
      },
    });
    await tx.rating.update({
      where: { userId_category: { userId: blackId, category } },
      data: {
        rating: newBlack.rating,
        deviation: newBlack.deviation,
        volatility: newBlack.volatility,
        gamesPlayed: { increment: 1 },
      },
    });

    return {
      white: { before: Math.round(white.rating), after: Math.round(newWhite.rating) },
      black: { before: Math.round(black.rating), after: Math.round(newBlack.rating) },
    };
  }
}
