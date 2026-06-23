import { useEffect, useState } from 'react';

interface ClockProps {
  ms: number;
  /** Whether this clock is the one currently ticking. */
  active: boolean;
  /** Server timestamp (ms) the `ms` value was accurate as of. */
  asOf: number;
  label: string;
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);
  return total < 20 ? `${m}:${s.toString().padStart(2, '0')}.${tenths}` : `${m}:${s.toString().padStart(2, '0')}`;
}

export function Clock({ ms, active, asOf, label }: ClockProps) {
  const [display, setDisplay] = useState(ms);

  useEffect(() => {
    if (!active) {
      setDisplay(ms);
      return;
    }
    const tick = () => setDisplay(ms - (Date.now() - asOf));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [ms, active, asOf]);

  // Low-time warning: only the active clock flashes, faster as time runs out.
  const flashing = active && display <= 20_000;
  const flashClass = !flashing
    ? ''
    : display <= 5_000
      ? 'clock-flash-fast'
      : display <= 10_000
        ? 'clock-flash-medium'
        : 'clock-flash-slow';
  // While flashing, the animation drives the background/colour; otherwise use the
  // normal active/idle styling.
  const baseColor = flashing
    ? 'text-white'
    : active
      ? 'bg-emerald-600 text-white'
      : 'bg-slate-800 text-slate-300';

  return (
    <div
      className={`flex items-center justify-between rounded px-4 py-2 font-mono text-2xl ${baseColor} ${flashClass}`}
    >
      <span className="text-sm">{label}</span>
      <span>{fmt(display)}</span>
    </div>
  );
}
