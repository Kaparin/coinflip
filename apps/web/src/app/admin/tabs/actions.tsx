'use client';

import { useState } from 'react';
import {
  useAdminUnlockFunds,
  useAdminForceCancel,
  useAdminRecoverSecret,
  useAdminImportOrphaned,
} from '@/hooks/use-admin';

export function ActionsTab() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Manual admin actions for fixing stuck states. Use with caution — these operations directly modify the database.
      </p>

      <UnlockFundsAction />
      <ForceCancelAction />
      <RecoverSecretAction />
      <ImportOrphanedAction />
    </div>
  );
}

function UnlockFundsAction() {
  const unlock = useAdminUnlockFunds();
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async () => {
    setResult(null);
    if (!userId || !amount) { setResult({ type: 'error', msg: 'Both fields required' }); return; }
    try {
      const res = await unlock.mutateAsync({ userId, amount });
      setResult({ type: 'success', msg: res.message });
      setUserId('');
      setAmount('');
    } catch (err) {
      setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <ActionCard
      title="Unlock Stuck Funds"
      description="Force-unlock locked funds for a user. Use when a user has locked balance but no active bets (visible in Diagnostics tab)."
    >
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User ID (UUID)"
          className="flex-1 min-w-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (micro LAUNCH)"
          className="w-40 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <button
          type="button"
          disabled={unlock.isPending}
          onClick={handleSubmit}
          className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-bold disabled:opacity-40"
        >
          {unlock.isPending ? 'Unlocking...' : 'Unlock'}
        </button>
      </div>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function ForceCancelAction() {
  const forceCancel = useAdminForceCancel();
  const [betId, setBetId] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async () => {
    setResult(null);
    if (!betId) { setResult({ type: 'error', msg: 'Bet ID required' }); return; }
    try {
      const res = await forceCancel.mutateAsync(Number(betId));
      setResult({ type: 'success', msg: res.message });
      setBetId('');
    } catch (err) {
      setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <ActionCard
      title="Force Cancel Bet"
      description="Force a bet into 'canceled' state and unlock funds for both participants. Use for stuck bets that the sweep can't resolve."
    >
      <div className="flex gap-3">
        <input
          type="number"
          value={betId}
          onChange={(e) => setBetId(e.target.value)}
          placeholder="Bet ID"
          className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <button
          type="button"
          disabled={forceCancel.isPending}
          onClick={handleSubmit}
          className="rounded-xl bg-[var(--color-danger)] px-4 py-2 text-xs font-bold disabled:opacity-40"
        >
          {forceCancel.isPending ? 'Canceling...' : 'Force Cancel'}
        </button>
      </div>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function RecoverSecretAction() {
  const recover = useAdminRecoverSecret();
  const [betId, setBetId] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async () => {
    setResult(null);
    if (!betId) { setResult({ type: 'error', msg: 'Bet ID required' }); return; }
    try {
      const res = await recover.mutateAsync(Number(betId));
      setResult({ type: 'success', msg: res.message });
      setBetId('');
    } catch (err) {
      setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <ActionCard
      title="Recover Missing Secret"
      description="Recover maker_secret from pending_bet_secrets table and attach it to a bet. This enables auto-reveal for bets that were imported without secrets."
    >
      <div className="flex gap-3">
        <input
          type="number"
          value={betId}
          onChange={(e) => setBetId(e.target.value)}
          placeholder="Bet ID"
          className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <button
          type="button"
          disabled={recover.isPending}
          onClick={handleSubmit}
          className="rounded-xl bg-green-600 px-4 py-2 text-xs font-bold disabled:opacity-40"
        >
          {recover.isPending ? 'Recovering...' : 'Recover Secret'}
        </button>
      </div>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function ImportOrphanedAction() {
  const importOrphaned = useAdminImportOrphaned();
  const [chainBetId, setChainBetId] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async () => {
    setResult(null);
    if (!chainBetId) { setResult({ type: 'error', msg: 'Chain Bet ID required' }); return; }
    try {
      const res = await importOrphaned.mutateAsync(Number(chainBetId));
      setResult({ type: 'success', msg: res.message });
      setChainBetId('');
    } catch (err) {
      setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <ActionCard
      title="Import Orphaned Bet"
      description="Import a specific bet from the blockchain into the database. Automatically recovers the secret if available in pending_bet_secrets."
    >
      <div className="flex gap-3">
        <input
          type="number"
          value={chainBetId}
          onChange={(e) => setChainBetId(e.target.value)}
          placeholder="Chain Bet ID"
          className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <button
          type="button"
          disabled={importOrphaned.isPending}
          onClick={handleSubmit}
          className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-bold disabled:opacity-40"
        >
          {importOrphaned.isPending ? 'Importing...' : 'Import from Chain'}
        </button>
      </div>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function ActionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ResultMsg({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <p className={`text-xs mt-1 ${type === 'success' ? 'text-green-400' : 'text-[var(--color-danger)]'}`}>
      {msg}
    </p>
  );
}
