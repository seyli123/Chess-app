import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingModule } from '../rating/rating.module';
import { GameModule } from '../game/game.module';
import { TournamentService } from './tournament.service';
import { TournamentManager } from './tournament-manager';
import { TournamentController } from './tournament.controller';
import { TournamentGateway } from './tournament.gateway';

@Module({
  imports: [AuthModule, RatingModule, GameModule],
  controllers: [TournamentController],
  providers: [TournamentService, TournamentManager, TournamentGateway],
})
export class TournamentModule {}
