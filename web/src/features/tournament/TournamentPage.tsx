import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { TOUR_EVENTS, type TournamentState } from '@chess/shared';
import { api } from '../../lib/api';
import { connect } from '../../lib/socket';
import { useAuth } from '../../lib/auth';

function fmtClock(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<TournamentState | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  // Locally ticked countdown seconded by server snapshots.
  const [countdown, setCountdown] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!id) return;
    const s = connect('/tournament');
    socketRef.current = s;
    s.emit(TOUR_EVENTS.watch, { tournamentId: id });
    s.on(TOUR_EVENTS.state, (snap: TournamentState) => {
      setState(snap);
      setCountdown(snap.status === 'SCHEDULED' ? snap.secondsToStart : snap.secondsRemaining);
    });
    // When the engine pairs us, jump into the game; we'll bounce back here on end.
    s.on(TOUR_EVENTS.game, (p: { gameId: string }) => navigate(`/game/${p.gameId}`));
    return () => {
      s.emit(TOUR_EVENTS.unwatch, { tournamentId: id });
      s.disconnect();
    };
  }, [id, navigate]);

  // Reflect whether the current user is an active (non-withdrawn) entrant.
  useEffect(() => {
    if (!me || !state) return;
    const row = state.standings.find((r) => r.userId === me.id);
    setJoined(!!row && !row.withdrawn);
  }, [me, state]);

  // Tick the countdown locally between server snapshots.
  useEffect(() => {
    if (!state || (state.status !== 'SCHEDULED' && state.status !== 'RUNNING')) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [state]);

  async function join() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/tournaments/${id}/join`, { method: 'POST' });
      setJoined(true);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/tournaments/${id}/withdraw`, { method: 'POST' });
      setJoined(false);
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="p-8">Loading tournament…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{state.name}</h1>
          <p className="text-sm text-slate-400">
            {state.category} · {Math.floor(state.initialSec / 60)}+{state.incrementSec}
          </p>
        </div>
        <div className="text-right">
          {state.status === 'SCHEDULED' && (
            <>
              <div className="text-xs uppercase text-slate-400">Starts in</div>
              <div className="text-2xl font-bold tabular-nums">{fmtClock(countdown)}</div>
            </>
          )}
          {state.status === 'RUNNING' && (
            <>
              <div className="text-xs uppercase text-emerald-400">Time left</div>
              <div className="text-2xl font-bold tabular-nums">{fmtClock(countdown)}</div>
            </>
          )}
          {state.status === 'FINISHED' && (
            <div className="rounded bg-slate-600 px-3 py-1 text-sm">Finished</div>
          )}
        </div>
      </div>

      {me && state.status !== 'FINISHED' && (
        <div className="mb-4">
          {joined ? (
            <div className="flex items-center gap-3">
              <span className="rounded bg-emerald-700 px-3 py-1.5 text-sm">You're in</span>
              <button
                onClick={withdraw}
                disabled={busy}
                className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
              >
                Withdraw
              </button>
              {state.status === 'RUNNING' && (
                <span className="text-xs text-slate-400">
                  Stay on this page — you'll be paired automatically.
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={join}
              disabled={busy}
              className="rounded bg-emerald-700 px-4 py-2 hover:bg-emerald-600 disabled:opacity-50"
            >
              Join tournament
            </button>
          )}
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="text-left text-slate-400">
          <tr>
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Player</th>
            <th className="py-2 pr-2 text-right">Games</th>
            <th className="py-2 pl-2 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {state.standings.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-slate-400">
                No players yet.
              </td>
            </tr>
          ) : (
            state.standings.map((row) => (
              <tr
                key={row.userId}
                className={`border-t border-slate-800 ${
                  row.userId === me?.id ? 'bg-slate-800/60' : ''
                } ${row.withdrawn ? 'opacity-40' : ''}`}
              >
                <td className="py-2 pr-2 tabular-nums">{row.rank}</td>
                <td className="py-2 pr-2">
                  {row.username}{' '}
                  <span className="text-xs text-slate-500">({row.rating})</span>
                  {row.onFire && <span title="On fire — wins worth double"> 🔥</span>}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums text-slate-400">
                  {row.gamesPlayed}
                </td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums">{row.score}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
