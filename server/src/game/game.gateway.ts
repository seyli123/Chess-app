import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { GAME_EVENTS, type MovePayload } from '@chess/shared';
import { config } from '../config/config';
import { AuthService } from '../auth/auth.service';
import { GameManager } from './game-manager';

@WebSocketGateway({ namespace: '/game', cors: { origin: config.corsOrigin, credentials: true } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    private readonly manager: GameManager,
    private readonly auth: AuthService,
  ) {}

  afterInit(server: Namespace) {
    this.manager.attachNamespace(server);
  }

  async handleConnection(socket: Socket) {
    // Authentication is optional: anonymous sockets may spectate, but only an
    // authenticated player whose id matches the game can make moves.
    const token = socket.handshake.auth?.token as string | undefined;
    if (token) {
      try {
        socket.data.userId = await this.auth.verifyAccess(token);
      } catch {
        socket.data.userId = undefined;
      }
    }
  }

  private join(socket: Socket, gameId: string) {
    socket.join(gameId);
    const g = this.manager.get(gameId);
    if (g) socket.emit(GAME_EVENTS.state, this.manager.buildState(g));
    else socket.emit(GAME_EVENTS.error, { message: 'game not active' });
  }

  @SubscribeMessage(GAME_EVENTS.join)
  onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { gameId: string }) {
    this.join(socket, body.gameId);
  }

  @SubscribeMessage(GAME_EVENTS.spectate)
  onSpectate(@ConnectedSocket() socket: Socket, @MessageBody() body: { gameId: string }) {
    this.join(socket, body.gameId);
  }

  @SubscribeMessage(GAME_EVENTS.move)
  async onMove(@ConnectedSocket() socket: Socket, @MessageBody() body: MovePayload) {
    const userId = socket.data.userId;
    if (!userId) return;
    await this.manager.handleMove(body.gameId, userId, {
      from: body.from,
      to: body.to,
      promotion: body.promotion,
    });
  }

  @SubscribeMessage(GAME_EVENTS.resign)
  async onResign(@ConnectedSocket() socket: Socket, @MessageBody() body: { gameId: string }) {
    if (socket.data.userId) await this.manager.resign(body.gameId, socket.data.userId);
  }

  @SubscribeMessage(GAME_EVENTS.abort)
  async onAbort(@ConnectedSocket() socket: Socket, @MessageBody() body: { gameId: string }) {
    if (socket.data.userId) await this.manager.abort(body.gameId, socket.data.userId);
  }

  @SubscribeMessage(GAME_EVENTS.offerDraw)
  onOfferDraw(@ConnectedSocket() socket: Socket, @MessageBody() body: { gameId: string }) {
    if (socket.data.userId) this.manager.offerDraw(body.gameId, socket.data.userId);
  }

  @SubscribeMessage(GAME_EVENTS.acceptDraw)
  async onAcceptDraw(@ConnectedSocket() socket: Socket, @MessageBody() body: { gameId: string }) {
    if (socket.data.userId) await this.manager.acceptDraw(body.gameId, socket.data.userId);
  }

  @SubscribeMessage(GAME_EVENTS.declineDraw)
  onDeclineDraw(@ConnectedSocket() socket: Socket, @MessageBody() body: { gameId: string }) {
    if (socket.data.userId) this.manager.declineDraw(body.gameId, socket.data.userId);
  }
}
