import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { GameService } from './game.service';

@Controller('games')
export class GameController {
  constructor(private readonly games: GameService) {}

  @Get('active')
  listActive() {
    return this.games.listActive();
  }

  @Get('user/:userId')
  byUser(@Param('userId') userId: string) {
    return this.games.getUserGames(userId);
  }

  @Get(':id')
  async byId(@Param('id') id: string) {
    const game = await this.games.getGame(id);
    if (!game) throw new NotFoundException();
    return game;
  }
}
