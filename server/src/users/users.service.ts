import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async stats(userId: string) {
    const [asWhite, asBlack] = await Promise.all([
      this.prisma.game.groupBy({
        by: ['result'],
        where: { whiteId: userId, status: 'FINISHED' },
        _count: true,
      }),
      this.prisma.game.groupBy({
        by: ['result'],
        where: { blackId: userId, status: 'FINISHED' },
        _count: true,
      }),
    ]);
    let wins = 0;
    let losses = 0;
    let draws = 0;
    for (const row of asWhite) {
      if (row.result === 'WHITE_WINS') wins += row._count;
      else if (row.result === 'BLACK_WINS') losses += row._count;
      else if (row.result === 'DRAW') draws += row._count;
    }
    for (const row of asBlack) {
      if (row.result === 'BLACK_WINS') wins += row._count;
      else if (row.result === 'WHITE_WINS') losses += row._count;
      else if (row.result === 'DRAW') draws += row._count;
    }
    return { wins, losses, draws, total: wins + losses + draws };
  }

  async getProfileByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { ratings: true },
    });
    if (!user) throw new NotFoundException('user not found');
    return this.shape(user);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { ratings: true },
    });
    if (!user) throw new NotFoundException('user not found');
    return this.shape(user);
  }

  private async shape(user: {
    id: string;
    username: string;
    email: string;
    createdAt: Date;
    ratings: { category: string; rating: number; deviation: number; gamesPlayed: number }[];
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      ratings: user.ratings.map((r) => ({
        category: r.category,
        rating: Math.round(r.rating),
        deviation: Math.round(r.deviation),
        gamesPlayed: r.gamesPlayed,
      })),
      stats: await this.stats(user.id),
    };
  }
}
