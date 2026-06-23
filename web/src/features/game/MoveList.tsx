import { useEffect, useRef } from 'react';
import type { HistoryEntry } from './history';

interface MoveListProps {
  history: HistoryEntry[];
  /** Current ply being viewed (0 = start position). */
  cursor: number;
  /** Jump to a given ply. */
  onSeek: (ply: number) => void;
}

/**
 * Scrollable two-column move list with first/prev/next/last controls. The move
 * matching the current cursor is highlighted, and clicking any move seeks to it.
 */
export function MoveList({ history, cursor, onSeek }: MoveListProps) {
  const plies = history.length - 1;
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the highlighted move in view as you navigate.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const rows = [];
  for (let i = 1; i <= plies; i += 2) {
    rows.push({ no: (i + 1) / 2, white: i, black: i + 1 <= plies ? i + 1 : null });
  }

  const cell = (ply: number | null) => {
    if (ply == null) return <td className="px-2 py-0.5" />;
    const active = ply === cursor;
    return (
      <td className="px-1 py-0.5">
        <button
          ref={active ? activeRef : undefined}
          onClick={() => onSeek(ply)}
          className={`w-full rounded px-1.5 py-0.5 text-left font-mono text-sm ${
            active ? 'bg-emerald-700 text-white' : 'hover:bg-slate-700'
          }`}
        >
          {history[ply].san}
        </button>
      </td>
    );
  };

  const navBtn = (label: string, to: number, disabled: boolean, title: string) => (
    <button
      onClick={() => onSeek(to)}
      disabled={disabled}
      title={title}
      className="flex-1 rounded bg-slate-700 py-1 text-sm hover:bg-slate-600 disabled:opacity-40"
    >
      {label}
    </button>
  );

  return (
    <div className="rounded bg-slate-800 p-2">
      <div className="mb-2 flex gap-1">
        {navBtn('«', 0, cursor === 0, 'Start')}
        {navBtn('‹', cursor - 1, cursor === 0, 'Previous')}
        {navBtn('›', cursor + 1, cursor >= plies, 'Next')}
        {navBtn('»', plies, cursor >= plies, 'Latest')}
      </div>
      {plies === 0 ? (
        <p className="px-1 py-2 text-sm text-slate-500">No moves yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((r) => (
                <tr key={r.no}>
                  <td className="w-7 px-1 py-0.5 text-right text-xs text-slate-500">{r.no}.</td>
                  {cell(r.white)}
                  {cell(r.black)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
