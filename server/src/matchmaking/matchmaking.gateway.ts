import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { MM_EVENTS, TIME_CONTROL_BY_ID, type MmJoinPayload } from '@chess/shared';
import { config } from '../config/config';
import { AuthService } from '../auth/auth.service';
import { MatchmakingService, type PairMatch } from './matchmaking.service';

/** How often the background sweep re-attempts pairing waiting players. */
const SWEEP_INTERVAL_MS = 1500;

@WebSocketGateway({
  namespace: '/matchmaking',
  cors: { origin: config.corsOrigin, credentials: true },
})
export class MatchmakingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  /** userId -> connected socket (single-instance routing for match notices). */
  private readonly sockets = new Map<string, Socket>();
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly mm: MatchmakingService,
    private readonly auth: AuthService,
  ) {}

  afterInit() {
    // Periodically pair any waiting players. This catches pairs that both
    // enqueued without seeing each other and lets the rating tolerance widen
    // over time, so searches never get permanently stuck.
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private async sweep() {
    for (const tcId of Object.keys(TIME_CONTROL_BY_ID)) {
      try {
        this.notify(await this.mm.tryPair(tcId));
      } catch {
        // ignore transient errors; the next sweep retries
      }
    }
  }

  private notify(matches: PairMatch[]) {
    for (const match of matches) {
      for (const playerId of match.players) {
        this.sockets.get(playerId)?.emit(MM_EVENTS.matched, { gameId: match.gameId });
      }
    }
  }

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
    await this.mm.enqueue(userId, body.timeControlId);
    const matches = await this.mm.tryPair(body.timeControlId);
    this.notify(matches);
    // If this player wasn't paired immediately, the sweep will keep trying.
    if (!matches.some((m) => m.players.includes(userId))) {
      socket.emit(MM_EVENTS.queued, { timeControlId: body.timeControlId });
    }
  }

  @SubscribeMessage(MM_EVENTS.leave)
  async onLeave(@ConnectedSocket() socket: Socket) {
    const userId = socket.data.userId as string;
    if (userId) await this.mm.leave(userId);
  }
}
