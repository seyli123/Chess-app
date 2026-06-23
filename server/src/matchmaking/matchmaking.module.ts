import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingModule } from '../rating/rating.module';
import { GameModule } from '../game/game.module';
import { WalletModule } from '../wallet/wallet.module';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';

@Module({
  imports: [AuthModule, RatingModule, GameModule, WalletModule],
  providers: [MatchmakingService, MatchmakingGateway],
})
export class MatchmakingModule {}
