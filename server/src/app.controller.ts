import { Controller, Get } from '@nestjs/common';
import { TIME_CONTROLS } from '@chess/shared';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('time-controls')
  timeControls() {
    return TIME_CONTROLS;
  }
}
