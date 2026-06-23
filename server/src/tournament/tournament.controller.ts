import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard, CurrentUser } from '../auth/jwt.guard';
import { TournamentService } from './tournament.service';
import { TournamentManager } from './tournament-manager';
import { CreateTournamentDto } from './dto';

@Controller('tournaments')
export class TournamentController {
  constructor(
    private readonly tournaments: TournamentService,
    private readonly manager: TournamentManager,
  ) {}

  @Get()
  list() {
    return this.tournaments.list();
  }

  @Post()
  @UseGuards(JwtGuard)
  async create(@CurrentUser() userId: string, @Body() dto: CreateTournamentDto) {
    const t = await this.tournaments.create(dto, userId);
    await this.manager.registerCreated(t.id);
    return t;
  }

  @Get(':id')
  async byId(@Param('id') id: string) {
    const t = await this.tournaments.getWithPlayers(id);
    if (!t) throw new NotFoundException();
    return t;
  }

  @Post(':id/join')
  @UseGuards(JwtGuard)
  @HttpCode(200)
  async join(@Param('id') id: string, @CurrentUser() userId: string) {
    const player = await this.tournaments.join(id, userId);
    await this.manager.addPlayer(id, userId, player.user.username);
    return { joined: true };
  }

  @Post(':id/withdraw')
  @UseGuards(JwtGuard)
  @HttpCode(200)
  async withdraw(@Param('id') id: string, @CurrentUser() userId: string) {
    await this.tournaments.withdraw(id, userId);
    this.manager.withdrawPlayer(id, userId);
    return { withdrawn: true };
  }
}
