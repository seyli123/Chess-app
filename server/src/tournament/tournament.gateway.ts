import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { TOUR_EVENTS, type TourWatchPayload } from '@chess/shared';
import { config } from '../config/config';
import { AuthService } from '../auth/auth.service';
import { TournamentManager } from './tournament-manager';

/**
 * Real-time tournament namespace. Anonymous sockets may watch standings;
 * authenticated sockets additionally register "presence" so the engine can pair
 * them and push their next game.
 */
@WebSocketGateway({
  namespace: '/tournament',
  cors: { origin: config.corsOrigin, credentials: true },
})
export class TournamentGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly manager: TournamentManager,
    private readonly auth: AuthService,
  ) {}

  afterInit(ns: Namespace) {
    this.manager.attachNamespace(ns);
  }

  async handleConnection(socket: Socket) {
    // Auth is optional: a token unlocks pairing; without one you can spectate.
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        socket.data.userId = await this.auth.verifyAccess(token);
      } catch {
        socket.data.userId = undefined;
      }
    }
  }

  handleDisconnect(socket: Socket) {
    this.manager.handleDisconnect(socket, socket.data.userId);
  }

  @SubscribeMessage(TOUR_EVENTS.watch)
  async onWatch(@ConnectedSocket() socket: Socket, @MessageBody() body: TourWatchPayload) {
    await this.manager.watch(body.tournamentId, socket, socket.data.userId);
  }

  @SubscribeMessage(TOUR_EVENTS.unwatch)
  onUnwatch(@ConnectedSocket() socket: Socket, @MessageBody() body: TourWatchPayload) {
    this.manager.unwatch(body.tournamentId, socket, socket.data.userId);
  }
}
