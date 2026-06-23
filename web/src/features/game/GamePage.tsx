import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { GAME_EVENTS, type Color, type GameState } from '@chess/shared';
import { connect } from '../../lib/socket';
import { useAuth } from '../../lib/auth';
import { Board } from '../board/Board';
import { PieceThemeSelector } from '../board/PieceThemeSelector';
import { Clock } from './Clock';

interface EndedPayload extends GameState {
  ratingChange?: {
    white: { before: number; after: number };
    black: { before: number; after: number };
  };
}

export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<GameState | null>(null);
  const [ended, setEnded] = useState<EndedPayload | null>(null);
  const [notice, setNotice] = useState<string>('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!id) return;
    const socket = connect('/game');
    socketRef.current = socket;
    socket.emit(GAME_EVENTS.join, { gameId: id });
    socket.on(GAME_EVENTS.state, (s: GameState) => {
      setState(s);
      if (s.status !== 'ACTIVE') setEnded(s as EndedPayload);
    });
    socket.on(GAME_EVENTS.ended, (s: EndedPayload) => {
      setState(s);
      setEnded(s);
    });
    socket.on(GAME_EVENTS.moveRejected, (p: { reason: string }) => setNotice(p.reason));
    socket.on(GAME_EVENTS.error, (p: { message: string }) => setNotice(p.message));
    return () => {
      socket.disconnect();
    };
  }, [id]);

  // In an arena game, players bounce back to the tournament after it ends so the
  // engine can pair them again. Only redirect a participant, never a spectator.
  useEffect(() => {
    if (!ended?.tournamentId) return;
    const isPlayer = me?.id === ended.white.id || me?.id === ended.black.id;
    if (!isPlayer) return;
    const t = setTimeout(() => navigate(`/tournaments/${ended.tournamentId}`), 4000);
    return () => clearTimeout(t);
  }, [ended, me, navigate]);

  // A wagered game settles on end — refresh the nav balance for participants.
  useEffect(() => {
    if (!ended || !ended.wager) return;
    if (me?.id === ended.white.id || me?.id === ended.black.id) void refresh();
  }, [ended, me, refresh]);

  if (!state) return <div className="p-8">Loading game…</div>;

  const myColor: Color | undefined =
    me?.id === state.white.id ? 'white' : me?.id === state.black.id ? 'black' : undefined;
  const orientation: Color = myColor ?? 'white';
  const isMyTurn = myColor && state.status === 'ACTIVE' && state.turn === myColor;

  const emit = (event: string, extra: object = {}) =>
    socketRef.current?.emit(event, { gameId: id, ...extra });

  const move = (from: string, to: string, promotion?: string) =>
    emit(GAME_EVENTS.move, { from, to, promotion });

  const top = orientation === 'white' ? state.black : state.white;
  const bottom = orientation === 'white' ? state.white : state.black;
  const lastMove = undefined; // derive from PGN if needed

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:flex-row">
      <div className="flex-1">
        <Clock
          ms={state.clock[top.color]}
          active={state.status === 'ACTIVE' && state.turn === top.color}
          asOf={state.lastMoveAt}
          label={`${top.username} (${top.rating})`}
        />
        <div className="my-2">
          <Board
            fen={state.fen}
            orientation={orientation}
            turn={state.turn}
            movableColor={isMyTurn ? myColor : undefined}
            lastMove={lastMove}
            onMove={move}
          />
        </div>
        <Clock
          ms={state.clock[bottom.color]}
          active={state.status === 'ACTIVE' && state.turn === bottom.color}
          asOf={state.lastMoveAt}
          label={`${bottom.username} (${bottom.rating})`}
        />
        <div className="mt-3 flex justify-end">
          <PieceThemeSelector />
        </div>
      </div>

      <div className="w-full md:w-72">
        <div className="rounded bg-slate-800 p-4">
          <h2 className="mb-2 text-lg font-semibold">
            {state.category} · {Math.floor(state.initialSec / 60)}+{state.incrementSec}
            {state.rated ? ' · Rated' : ' · Casual'}
          </h2>

          {state.wager ? (
            <p className="mb-2 rounded bg-slate-900 px-2 py-1 text-sm text-amber-300">
              💰 Wager {state.wager} each · pot {state.wager * 2}
            </p>
          ) : null}

          {ended ? (
            <div className="space-y-1">
              <p className="font-semibold text-emerald-400">
                {ended.result === 'DRAW'
                  ? 'Draw'
                  : ended.result === 'WHITE_WINS'
                    ? `${state.white.username} won`
                    : `${state.black.username} won`}
              </p>
              <p className="text-sm text-slate-400">{ended.termination}</p>
              {ended.ratingChange && (
                <p className="text-sm">
                  {state.white.username}: {ended.ratingChange.white.before} →{' '}
                  {ended.ratingChange.white.after}
                  <br />
                  {state.black.username}: {ended.ratingChange.black.before} →{' '}
                  {ended.ratingChange.black.after}
                </p>
              )}
            </div>
          ) : myColor ? (
            <div className="space-y-2">
              <button
                onClick={() => emit(GAME_EVENTS.resign)}
                className="w-full rounded bg-red-700 py-2 hover:bg-red-600"
              >
                Resign
              </button>
              {state.drawOfferFrom && state.drawOfferFrom !== myColor ? (
                <button
                  onClick={() => emit(GAME_EVENTS.acceptDraw)}
                  className="w-full rounded bg-emerald-700 py-2 hover:bg-emerald-600"
                >
                  Accept draw offer
                </button>
              ) : (
                <button
                  onClick={() => emit(GAME_EVENTS.offerDraw)}
                  className="w-full rounded bg-slate-700 py-2 hover:bg-slate-600"
                >
                  Offer draw
                </button>
              )}
              <button
                onClick={() => emit(GAME_EVENTS.abort)}
                className="w-full rounded bg-slate-700 py-2 text-sm hover:bg-slate-600"
              >
                Abort (before first move)
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Spectating</p>
          )}

          {notice && <p className="mt-3 text-sm text-amber-400">{notice}</p>}
        </div>
      </div>
    </div>
  );
}
