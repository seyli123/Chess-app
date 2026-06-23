import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TIME_CONTROLS, type TournamentSummary } from '@chess/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const STATUS_STYLES: Record<string, string> = {
  RUNNING: 'bg-emerald-600',
  SCHEDULED: 'bg-sky-700',
  FINISHED: 'bg-slate-600',
};

function fmtStart(iso: string, status: string): string {
  if (status === 'FINISHED') return 'Finished';
  const d = new Date(iso);
  const diffMin = Math.round((d.getTime() - Date.now()) / 60000);
  if (status === 'RUNNING') return 'In progress';
  if (diffMin <= 0) return 'Starting…';
  if (diffMin < 60) return `Starts in ${diffMin} min`;
  return `Starts ${d.toLocaleString()}`;
}

export function TournamentsPage() {
  const { me } = useAuth();
  const [list, setList] = useState<TournamentSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [timeControlId, setTimeControlId] = useState(TIME_CONTROLS[2].id);
  const [durationMin, setDurationMin] = useState(30);
  const [startInMin, setStartInMin] = useState(1);
  const [error, setError] = useState('');

  async function refresh() {
    setList(await api<TournamentSummary[]>('/tournaments'));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          name,
          timeControlId,
          durationMin,
          startsAt: new Date(Date.now() + startInMin * 60000).toISOString(),
        }),
      });
      setShowForm(false);
      setName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Arena tournaments</h1>
        {me && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600"
          >
            {showForm ? 'Cancel' : 'New tournament'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="mb-6 space-y-3 rounded bg-slate-800 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tournament name"
            required
            minLength={3}
            className="w-full rounded bg-slate-900 px-3 py-2"
          />
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm">
              Time control
              <select
                value={timeControlId}
                onChange={(e) => setTimeControlId(e.target.value)}
                className="mt-1 w-full rounded bg-slate-900 px-2 py-2"
              >
                {TIME_CONTROLS.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.label} · {tc.category}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Duration (min)
              <input
                type="number"
                min={5}
                max={360}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="mt-1 w-full rounded bg-slate-900 px-2 py-2"
              />
            </label>
            <label className="text-sm">
              Starts in (min)
              <input
                type="number"
                min={0}
                max={1440}
                value={startInMin}
                onChange={(e) => setStartInMin(Number(e.target.value))}
                className="mt-1 w-full rounded bg-slate-900 px-2 py-2"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="rounded bg-emerald-700 px-4 py-2 hover:bg-emerald-600">Create</button>
        </form>
      )}

      {list.length === 0 ? (
        <p className="text-slate-400">No tournaments yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <Link
                to={`/tournaments/${t.id}`}
                className="flex items-center justify-between rounded bg-slate-800 px-4 py-3 hover:bg-slate-700"
              >
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-slate-400">
                    {t.category} · {Math.floor(t.initialSec / 60)}+{t.incrementSec} ·{' '}
                    {t.durationMin} min · {t.playerCount} players
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs ${STATUS_STYLES[t.status] ?? 'bg-slate-600'}`}
                >
                  {fmtStart(t.startsAt, t.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
