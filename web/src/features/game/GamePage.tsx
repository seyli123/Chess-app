import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { GAME_EVENTS, type Color, type GameState } from '@chess/shared';
import { api } from '../../lib/api';
import { connect } from '../../lib/socket';
import { useAuth } from '../../lib/auth';
import { Board } from '../board/Board';
import { PieceThemeSelector } from '../board/PieceThemeSelector';
import { Clock } from './Clock';
import { MoveList } from './MoveList';
import { CapturedPanel } from './CapturedPanel';
import { parseHistory, materialAt } from './history';

interface EndedPayload extends GameState {
  ratingChange?: {
    white: { before: number; after: number };
    black: { before: number; after: number };
  };
}

/** Minimal shape of GET /games/:id used to review evicted (finished) games. */
interface GameRow {
  id: string;
  fen: string;
  pgn: string;
  category: GameState['category'];
  initialSec: number;
  incrementSec: number;
  rated: boolean;
  status: GameState['status'];
  result?: GameState['result'];
  termination?: GameState['termination'];
  wagerAmount: string;
  tournamentId: string | null;
  white: { id: string; username: string };
  black: { id: string; username: string };
}

/** Build a read-only GameState from a persisted row (for post-eviction review). */
function reviewStateFromRow(row: GameRow): GameState {
  const turn: Color = row.fen?.split(' ')[1] === 'b' ? 'black' : 'white';
  return {
    id: row.id,
    fen: row.fen,
    pgn: row.pgn ?? '',
    turn,
    white: { id: row.white.id, username: row.white.username, rating: 0, color: 'white' },
    black: { id: row.black.id, username: row.black.username, rating: 0, color: 'black' },
    category: row.category,
    initialSec: row.initialSec,
    incrementSec: row.incrementSec,
    rated: row.rated,
    clock: { white: 0, black: 0 },
    status: row.status,
    result: row.result,
    termination: row.termination,
    lastMoveAt: 0,
    wager: Number(row.wagerAmount ?? 0),
    tournamentId: row.tournamentId ?? undefined,
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

  // ---- History navigation ----
  const history = useMemo(() => parseHistory(state?.pgn ?? ''), [state?.pgn]);
  const plies = history.length - 1;
  const [cursor, setCursor] = useState(0);
  // Whether the user is following the live position (vs. reviewing the past).
  const followingRef = useRef(true);

  // Advance with the game while following; stay put while reviewing history.
  useEffect(() => {
    if (followingRef.current) setCursor(plies);
  }, [plies]);

  const seek = useCallback(
    (ply: number) => {
      const clamped = Math.max(0, Math.min(plies, ply));
      setCursor(clamped);
      followingRef.current = clamped === plies;
    },
    [plies],
  );

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
    socket.on(GAME_EVENTS.error, async (p: { message: string }) => {
      // The live game isn't in memory (finished + evicted) — load it for review.
      if (p.message === 'game not active') {
        try {
          const row = await api<GameRow>(`/games/${id}`);
          const rs = reviewStateFromRow(row);
          setState(rs);
          if (rs.status !== 'ACTIVE') setEnded(rs as EndedPayload);
          return;
        } catch {
          /* fall through to showing the notice */
        }
      }
      setNotice(p.message);
    });
    return () => {
      socket.disconnect();
    };
  }, [id]);

  // Keyboard navigation through the move history.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') seek(cursor - 1);
      else if (e.key === 'ArrowRight') seek(cursor + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek, cursor]);

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

  if (!state) return <div className="p-8">{notice || 'Loading game…'}</div>;

  const myColor: Color | undefined =
    me?.id === state.white.id ? 'white' : me?.id === state.black.id ? 'black' : undefined;
  const orientation: Color = myColor ?? 'white';

  // Position currently being viewed (live tip or a past ply).
  const view = history[Math.min(cursor, plies)] ?? history[0];
  const viewTurn: Color = view.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const atLatest = cursor === plies;
  // Moves are only allowed on your turn at the live position of an active game.
  const canMove = !!myColor && state.status === 'ACTIVE' && atLatest && state.turn === myColor;
  const material = materialAt(history, cursor);

  const emit = (event: string, extra: object = {}) =>
    socketRef.current?.emit(event, { gameId: id, ...extra });

  const move = (from: string, to: string, promotion?: string) =>
    emit(GAME_EVENTS.move, { from, to, promotion });

  const top = orientation === 'white' ? state.black : state.white;
  const bottom = orientation === 'white' ? state.white : state.black;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:flex-row">
      <div className="flex-1">
        <Clock
          ms={state.clock[top.color]}
          active={state.status === 'ACTIVE' && state.turn === top.color}
          asOf={state.lastMoveAt}
          label={`${top.username}${top.rating ? ` (${top.rating})` : ''}`}
        />
        <div className="mt-1">
          <CapturedPanel side={top.color} material={material} />
        </div>
        <div className="my-2">
          <Board
            fen={view.fen}
            orientation={orientation}
            turn={viewTurn}
            movableColor={canMove ? myColor : undefined}
            lastMove={view.lastMove}
            onMove={move}
          />
        </div>
        <div className="mb-1">
          <CapturedPanel side={bottom.color} material={material} />
        </div>
        <Clock
          ms={state.clock[bottom.color]}
          active={state.status === 'ACTIVE' && state.turn === bottom.color}
          asOf={state.lastMoveAt}
          label={`${bottom.username}${bottom.rating ? ` (${bottom.rating})` : ''}`}
        />
        <div className="mt-3 flex justify-end">
          <PieceThemeSelector />
        </div>
      </div>

      <div className="flex w-full flex-col gap-4 md:w-72">
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
          {!atLatest && state.status === 'ACTIVE' && (
            <p className="mt-3 text-sm text-amber-400">
              Reviewing move {cursor}/{plies} — return to live to play.
            </p>
          )}
        </div>

        <MoveList history={history} cursor={cursor} onSeek={seek} />
      </div>
    </div>
  );
}
