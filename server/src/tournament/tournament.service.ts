import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TimeCategory } from '@prisma/client';
import { TIME_CONTROL_BY_ID } from '@chess/shared';
import { PrismaService } from '../common/prisma.service';
import { CreateTournamentDto } from './dto';

/**
 * Database layer for tournaments. The live pairing/scoring engine lives in
 * {@link TournamentManager}; this service owns persistence only.
 */
@Injectable()
export class TournamentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTournamentDto, createdById: string) {
    const tc = TIME_CONTROL_BY_ID[dto.timeControlId];
    if (!tc) throw new BadRequestException('unknown time control');
    // A start in the past is clamped to "now" by the manager when it schedules.
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    return this.prisma.tournament.create({
      data: {
        name: dto.name,
        category: tc.category as TimeCategory,
        initialSec: tc.initialSec,
        incrementSec: tc.incrementSec,
        startsAt,
        durationMin: dto.durationMin,
        createdById,
      },
    });
  }

  /** Upcoming + running tournaments first, then recently finished. */
  async list() {
    const rows = await this.prisma.tournament.findMany({
      orderBy: [{ status: 'asc' }, { startsAt: 'asc' }],
      include: { _count: { select: { players: true } } },
      take: 100,
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      initialSec: t.initialSec,
      incrementSec: t.incrementSec,
      startsAt: t.startsAt.toISOString(),
      durationMin: t.durationMin,
      status: t.status,
      playerCount: t._count.players,
    }));
  }

  getWithPlayers(id: string) {
    return this.prisma.tournament.findUnique({
      where: { id },
      include: {
        players: { include: { user: { select: { id: true, username: true } } } },
      },
    });
  }

  /** Tournaments not yet finished — used by the manager to (re)schedule on boot. */
  loadActive() {
    return this.prisma.tournament.findMany({
      where: { status: { in: ['SCHEDULED', 'RUNNING'] } },
      include: {
        players: { include: { user: { select: { id: true, username: true } } } },
      },
    });
  }

  /** Register a player (idempotent unless they previously withdrew, which is undone). */
  async join(tournamentId: string, userId: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) throw new NotFoundException('tournament not found');
    if (t.status === 'FINISHED') throw new BadRequestException('tournament is over');
    return this.prisma.tournamentPlayer.upsert({
      where: { tournamentId_userId: { tournamentId, userId } },
      create: { tournamentId, userId },
      update: { withdrawn: false },
      include: { user: { select: { id: true, username: true } } },
    });
  }

  async withdraw(tournamentId: string, userId: string) {
    await this.prisma.tournamentPlayer.updateMany({
      where: { tournamentId, userId },
      data: { withdrawn: true },
    });
  }

  setStatus(id: string, status: 'SCHEDULED' | 'RUNNING' | 'FINISHED') {
    return this.prisma.tournament.update({ where: { id }, data: { status } });
  }

  /** Persist a player's running totals after one of their games is scored. */
  persistPlayer(
    tournamentId: string,
    userId: string,
    data: {
      score: number;
      performance: number;
      gamesPlayed: number;
      streak: number;
      bestStreak: number;
    },
  ) {
    return this.prisma.tournamentPlayer.updateMany({
      where: { tournamentId, userId },
      data,
    });
  }
}
