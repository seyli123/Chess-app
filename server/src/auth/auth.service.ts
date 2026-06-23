import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { config } from '../config/config';
import { RegisterDto, LoginDto } from './dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    // forwardRef: WalletModule also depends on AuthModule (JwtGuard).
    @Inject(forwardRef(() => WalletService))
    private readonly wallet: WalletService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(userId: string): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: config.jwt.accessSecret, expiresIn: config.jwt.accessTtl },
    );
    // Refresh token: opaque random string, stored hashed for rotation/revocation.
    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs(config.jwt.refreshTtl));
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(refreshToken), expiresAt },
    });
    return { accessToken, refreshToken };
  }

  private ttlMs(ttl: string): number {
    const m = ttl.match(/^(\d+)([smhd])$/);
    if (!m) return 30 * 24 * 3600 * 1000;
    const n = parseInt(m[1], 10);
    const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]]!;
    return n * unit;
  }

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('Email or username already taken');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, username: dto.username, passwordHash },
    });
    // Credit the automatic play-money signup grant before issuing tokens.
    await this.wallet.grantSignup(user.id);
    return this.issueTokens(user.id);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.login }, { username: dto.login }] },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Rotate: revoke old, issue new pair.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.userId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyAccess(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: config.jwt.accessSecret,
      });
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
