import { MatchmakingGateway } from './matchmaking.gateway';

/** Minimal fake socket carrying a token and a `data` bag, like socket.io. */
function fakeSocket(token: string) {
  return {
    handshake: { auth: { token } },
    data: {} as { userId?: string },
    disconnect: jest.fn(),
  } as any;
}

describe('MatchmakingGateway cleanup', () => {
  const auth = { verifyAccess: jest.fn(async () => 'user1') } as any;
  let mm: { join: jest.Mock; leave: jest.Mock };
  let gateway: MatchmakingGateway;

  beforeEach(() => {
    mm = { join: jest.fn(), leave: jest.fn() };
    gateway = new MatchmakingGateway(mm as any, auth);
  });

  it('does not clean up when a stale (replaced) socket disconnects', async () => {
    const first = fakeSocket('t1');
    const second = fakeSocket('t2');

    await gateway.handleConnection(first); // current = first
    await gateway.handleConnection(second); // current = second; first superseded

    // The new connection should have torn down the previous socket...
    expect(first.disconnect).toHaveBeenCalled();

    // ...and the stale socket's late disconnect must NOT dequeue the live user.
    await gateway.handleDisconnect(first);
    expect(mm.leave).not.toHaveBeenCalled();

    // The current socket disconnecting DOES clean up.
    await gateway.handleDisconnect(second);
    expect(mm.leave).toHaveBeenCalledWith('user1');
  });
});
