import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtGuard, CurrentUser } from '../auth/jwt.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(JwtGuard)
  me(@CurrentUser() userId: string) {
    return this.users.getMe(userId);
  }

  @Get(':username')
  profile(@Param('username') username: string) {
    return this.users.getProfileByUsername(username);
  }
}
