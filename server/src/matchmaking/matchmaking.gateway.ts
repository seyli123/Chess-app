import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { MM_EVENTS, type MmJoinPayload } from '@chess/shared';
import { config } from '../config/config';
import { AuthService } from '../auth/auth.service';
import { MatchmakingService } from './matchmaking.service';

@WebSocketGateway({
  namespace: '/matchmaking',
  cors: { origin: config.corsOrigin, credentials: true },
})
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  /** userId -> connected socket (single-instance routing for match notices). */
  private readonly sockets = new Map<string, Socket>();

  constructor(
    private readonly mm: MatchmakingService,
    private readonly auth: AuthService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      socket.disconnect();
      return;
    }
    try {
      const userId = await this.auth.verifyAccess(token);
      socket.data.userId = userId;
      this.sockets.set(userId, socket);
    } catch {
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId as string | undefined;
    if (userId) {
      this.sockets.delete(userId);
      await this.mm.leave(userId);
    }
  }

  @SubscribeMessage(MM_EVENTS.join)
  async onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: MmJoinPayload) {
    const userId = socket.data.userId as string;
    const result = await this.mm.join(userId, body.timeControlId, body.ratingRange);
    if (!result.matched) {
      socket.emit(MM_EVENTS.queued, { timeControlId: body.timeControlId });
      return;
    }
    for (const playerId of result.players) {
      this.sockets.get(playerId)?.emit(MM_EVENTS.matched, { gameId: result.gameId });
    }
  }

  @SubscribeMessage(MM_EVENTS.leave)
  async onLeave(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.userId as string;
    if (userId) await this.mm.leave(userId);
  }
}
