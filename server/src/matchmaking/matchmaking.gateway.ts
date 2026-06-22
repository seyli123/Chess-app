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
      // Supersede any previous socket for this user. Register the new one first
      // so the old socket's disconnect handler sees it is no longer current and
      // skips cleanup (preserving this fresh session's state).
      const previous = this.sockets.get(userId);
      this.sockets.set(userId, socket);
      if (previous && previous !== socket) previous.disconnect();
    } catch {
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;
    // Only clean up if THIS socket is still the user's current one. A late
    // disconnect from a previous/replaced socket (page transition, socket reuse,
    // or StrictMode remount) must not wipe the new session's queue entry and
    // routing — that is what left players stuck "searching" on a second game.
    if (this.sockets.get(userId) === socket) {
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
