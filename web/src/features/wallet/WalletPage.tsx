import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface LedgerRow {
  id: string;
  amount: string; // BigInt serialised as string
  type: string;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

interface Statement {
  balance: string;
  currency: string;
  canClaimFaucet: boolean;
  ledger: LedgerRow[];
}

/** Human labels for ledger transaction types. */
const TYPE_LABELS: Record<string, string> = {
  SIGNUP_GRANT: 'Signup grant',
  FAUCET: 'Faucet top-up',
  ESCROW_LOCK: 'Wager staked',
  PAYOUT: 'Winnings',
  REFUND: 'Wager refunded',
  FEE: 'Platform fee',
  ADMIN_GRANT: 'Admin grant',
};

function fmtAmount(amount: string): { text: string; positive: boolean } {
  const n = Number(amount);
  return { text: `${n > 0 ? '+' : ''}${n.toLocaleString()}`, positive: n >= 0 };
}

export function WalletPage() {
  const { refresh } = useAuth();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);

  async function load() {
    setStatement(await api<Statement>('/wallet'));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load wallet'));
  }, []);

  async function claimFaucet() {
    setClaiming(true);
    setError('');
    try {
      await api('/wallet/faucet', { method: 'POST' });
      await load();
      await refresh(); // update the nav balance
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Faucet claim failed');
    } finally {
      setClaiming(false);
    }
  }

  if (!statement) {
    return <div className="p-8">{error || 'Loading wallet…'}</div>;
  }

  const balance = Number(statement.balance);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Wallet</h1>

      <div className="mb-6 flex items-center justify-between rounded-lg bg-slate-800 p-5">
        <div>
          <div className="text-xs uppercase text-slate-400">Balance</div>
          <div className="text-3xl font-bold text-amber-300">
            {balance.toLocaleString()}{' '}
            <span className="text-base font-normal text-slate-400">{statement.currency}</span>
          </div>
        </div>
        <div className="text-right">
          <button
            onClick={claimFaucet}
            disabled={!statement.canClaimFaucet || claiming}
            className="rounded bg-emerald-700 px-4 py-2 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {claiming ? 'Claiming…' : 'Claim 500 (faucet)'}
          </button>
          <p className="mt-1 max-w-[12rem] text-xs text-slate-500">
            Available below 100 tokens, once per 24h.
          </p>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <h2 className="mb-2 text-lg font-semibold">Transaction history</h2>
      {statement.ledger.length === 0 ? (
        <p className="text-slate-400">No transactions yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-2 pr-2">When</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pl-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {statement.ledger.map((row) => {
              const amt = fmtAmount(row.amount);
              return (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="py-2 pr-2 text-slate-400">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-2">
                    {TYPE_LABELS[row.type] ?? row.type}
                    {row.refType === 'game' && (
                      <span className="ml-1 text-xs text-slate-500">· game</span>
                    )}
                  </td>
                  <td
                    className={`py-2 pl-2 text-right font-medium tabular-nums ${
                      amt.positive ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {amt.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
