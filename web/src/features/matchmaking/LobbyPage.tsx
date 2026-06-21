import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { MM_EVENTS, type TimeControl } from '@chess/shared';
import { api } from '../../lib/api';
import { connect } from '../../lib/socket';

interface ActiveGame {
  id: string;
  white: { username: string };
  black: { username: string };
  category: string;
}

export function LobbyPage() {
  const navigate = useNavigate();
  const [controls, setControls] = useState<TimeControl[]>([]);
  const [active, setActive] = useState<ActiveGame[]>([]);
  const [queuing, setQueuing] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    api<TimeControl[]>('/time-controls').then(setControls);
    api<ActiveGame[]>('/games/active').then(setActive);

    const s = connect('/matchmaking');
    setSocket(s);
    s.on(MM_EVENTS.matched, (p: { gameId: string }) => navigate(`/game/${p.gameId}`));
    return () => {
      s.disconnect();
    };
  }, [navigate]);

  function queue(tc: TimeControl) {
    if (!socket) return;
    if (queuing === tc.id) {
      socket.emit(MM_EVENTS.leave);
      setQueuing(null);
    } else {
      socket.emit(MM_EVENTS.join, { timeControlId: tc.id });
      setQueuing(tc.id);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Quick pairing</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {controls.map((tc) => (
          <button
            key={tc.id}
            onClick={() => queue(tc)}
            className={`rounded p-4 text-center ${
              queuing === tc.id ? 'bg-amber-600 animate-pulse' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <div className="text-xl font-bold">{tc.label}</div>
            <div className="text-xs uppercase text-slate-400">{tc.category}</div>
            {queuing === tc.id && <div className="mt-1 text-xs">Searching… (cancel)</div>}
          </button>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-xl font-semibold">Live games</h2>
      {active.length === 0 ? (
        <p className="text-slate-400">No live games right now.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((g) => (
            <li key={g.id}>
              <Link
                to={`/game/${g.id}`}
                className="block rounded bg-slate-800 px-4 py-2 hover:bg-slate-700"
              >
                {g.white.username} vs {g.black.username}{' '}
                <span className="text-xs text-slate-400">({g.category}) · spectate</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
