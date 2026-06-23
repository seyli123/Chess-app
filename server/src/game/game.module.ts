import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingModule } from '../rating/rating.module';
import { WalletModule } from '../wallet/wallet.module';
import { GameService } from './game.service';
import { GameManager } from './game-manager';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';

@Module({
  imports: [AuthModule, RatingModule, WalletModule],
  controllers: [GameController],
  providers: [GameService, GameManager, GameGateway],
  exports: [GameService, GameManager],
})
export class GameModule {}
