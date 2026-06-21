import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingModule } from '../rating/rating.module';
import { GameService } from './game.service';
import { GameManager } from './game-manager';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';

@Module({
  imports: [AuthModule, RatingModule],
  controllers: [GameController],
  providers: [GameService, GameManager, GameGateway],
  exports: [GameService, GameManager],
})
export class GameModule {}
