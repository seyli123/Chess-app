import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtGuard, CurrentUser } from '../auth/jwt.guard';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  /** Balance + full ledger for the current user, plus faucet eligibility. */
  @Get()
  async statement(@CurrentUser() userId: string) {
    const [statement, canClaimFaucet] = await Promise.all([
      this.wallet.getStatement(userId),
      this.wallet.canClaimFaucet(userId),
    ]);
    return { ...statement, canClaimFaucet };
  }

  @Post('faucet')
  @HttpCode(200)
  claimFaucet(@CurrentUser() userId: string) {
    return this.wallet.claimFaucet(userId);
  }
}
