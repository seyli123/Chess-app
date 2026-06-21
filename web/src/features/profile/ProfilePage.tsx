import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface GameRow {
  id: string;
  white: { username: string };
  black: { username: string };
  result: string | null;
  category: string;
  termination: string | null;
}

export function ProfilePage() {
  const { me } = useAuth();
  const [games, setGames] = useState<GameRow[]>([]);

  useEffect(() => {
    if (me) api<GameRow[]>(`/games/user/${me.id}`).then(setGames);
  }, [me]);

  if (!me) return null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">{me.username}</h1>
      <p className="text-slate-400">{me.email}</p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {me.ratings.length === 0 && (
          <p className="col-span-3 text-slate-400">No rated games yet.</p>
        )}
        {me.ratings.map((r) => (
          <div key={r.category} className="rounded bg-slate-800 p-3 text-center">
            <div className="text-xs uppercase text-slate-400">{r.category}</div>
            <div className="text-xl font-bold">{r.rating}</div>
            <div className="text-xs text-slate-500">{r.gamesPlayed} games</div>
          </div>
        ))}
      </div>

      <p className="mt-4">
        Record: <span className="text-emerald-400">{me.stats.wins}W</span> /{' '}
        <span className="text-red-400">{me.stats.losses}L</span> /{' '}
        <span className="text-slate-300">{me.stats.draws}D</span>
      </p>

      <h2 className="mb-2 mt-6 text-xl font-semibold">Recent games</h2>
      <ul className="space-y-2">
        {games.map((g) => (
          <li key={g.id}>
            <Link
              to={`/game/${g.id}`}
              className="block rounded bg-slate-800 px-4 py-2 hover:bg-slate-700"
            >
              {g.white.username} vs {g.black.username}{' '}
              <span className="text-xs text-slate-400">
                {g.category} · {g.result ?? '—'} · {g.termination ?? ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
