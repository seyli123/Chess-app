import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { MM_EVENTS, type TimeControl } from '@chess/shared';
import { api } from '../../lib/api';
import { connect } from '../../lib/socket';
import { useAuth } from '../../lib/auth';

interface ActiveGame {
  id: string;
  white: { username: string };
  black: { username: string };
  category: string;
}

/** Per-game wager cap (mirrors server config.wallet.maxWager). */
const MAX_WAGER = 100;

export function LobbyPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [controls, setControls] = useState<TimeControl[]>([]);
  const [active, setActive] = useState<ActiveGame[]>([]);
  const [queuing, setQueuing] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [wager, setWager] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api<TimeControl[]>('/time-controls').then(setControls);
    api<ActiveGame[]>('/games/active').then(setActive);

    const s = connect('/matchmaking');
    setSocket(s);
    s.on(MM_EVENTS.matched, (p: { gameId: string }) => navigate(`/game/${p.gameId}`));
    s.on(MM_EVENTS.error, (p: { message: string }) => {
      setNotice(p.message);
      setQueuing(null);
    });
    return () => {
      s.disconnect();
    };
  }, [navigate]);

  /** Clamp the wager into [0, MAX_WAGER], warning if the cap was hit. */
  function onWagerChange(raw: string) {
    let value = Math.floor(Number(raw));
    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value > MAX_WAGER) {
      value = MAX_WAGER;
      setNotice(`Maximum wager is ${MAX_WAGER} tokens — clamped to ${MAX_WAGER}.`);
    } else {
      setNotice('');
    }
    setWager(value);
  }

  function queue(tc: TimeControl) {
    if (!socket) return;
    if (queuing === tc.id) {
      socket.emit(MM_EVENTS.leave);
      setQueuing(null);
    } else {
      socket.emit(MM_EVENTS.join, { timeControlId: tc.id, wager });
      setQueuing(tc.id);
    }
  }

  const insufficient = wager > 0 && me != null && wager > me.balance;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Quick pairing</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded bg-slate-800 p-4">
        <label htmlFor="wager" className="text-sm font-medium">
          Wager (tokens)
        </label>
        <input
          id="wager"
          type="number"
          min={0}
          max={MAX_WAGER}
          value={wager}
          disabled={queuing !== null}
          onChange={(e) => onWagerChange(e.target.value)}
          className="w-24 rounded bg-slate-900 px-3 py-1.5 disabled:opacity-50"
        />
        <span className="text-xs text-slate-400">
          0 = casual · max {MAX_WAGER} · winner takes the pot (minus a 0.01% fee)
        </span>
        {me && (
          <span className="ml-auto text-xs text-slate-400">
            Balance: <span className="text-amber-300">{me.balance.toLocaleString()}</span>
          </span>
        )}
      </div>
      {notice && <p className="mb-3 text-sm text-amber-400">{notice}</p>}
      {insufficient && (
        <p className="mb-3 text-sm text-red-400">
          Wager exceeds your balance — lower it or top up on the wallet page.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {controls.map((tc) => (
          <button
            key={tc.id}
            onClick={() => queue(tc)}
            disabled={insufficient && queuing !== tc.id}
            className={`rounded p-4 text-center disabled:cursor-not-allowed disabled:opacity-40 ${
              queuing === tc.id ? 'bg-amber-600 animate-pulse' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <div className="text-xl font-bold">{tc.label}</div>
            <div className="text-xs uppercase text-slate-400">{tc.category}</div>
            {wager > 0 && <div className="mt-1 text-xs text-amber-300">⚑ {wager}</div>}
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
