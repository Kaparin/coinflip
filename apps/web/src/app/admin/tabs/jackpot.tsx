'use client';

import { useState } from 'react';
import {
  useAdminJackpotTiers,
  useAdminUpdateTier,
  useAdminForceDraw,
  useAdminResetPool,
  type AdminJackpotTier,
} from '@/hooks/use-admin';
import { StatCard, TableWrapper, ActionButton } from '../_shared';
import { formatLaunch } from '@coinflip/shared/constants';
import { Loader2 } from 'lucide-react';

const TIER_LABELS: Record<string, string> = {
  mini: 'Mini',
  medium: 'Medium',
  large: 'Large',
  mega: 'Mega',
  super_mega: 'Super Mega',
};

export function JackpotTab() {
  const { data: tiers, isLoading } = useAdminJackpotTiers();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!tiers || tiers.length === 0) {
    return <p className="text-center text-[var(--color-text-secondary)] py-8">No jackpot tiers found</p>;
  }

  // Summary stats
  const totalPooled = tiers.reduce((sum, t) => sum + BigInt(t.pool?.currentAmount ?? '0'), 0n);
  const activeTiers = tiers.filter((t) => t.isActive === 1).length;
  const drawingPools = tiers.filter((t) => t.pool?.status === 'drawing').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Pooled" value={formatLaunch(totalPooled.toString())} sub="COIN" />
        <StatCard label="Active Tiers" value={`${activeTiers} / ${tiers.length}`} />
        <StatCard label="Drawing" value={drawingPools} warn={drawingPools > 0} />
      </div>

      {/* Tier Table */}
      <TableWrapper>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-surface)] text-left text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">Min Games</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2">Pool Status</th>
              <th className="px-4 py-2">Current / Target</th>
              <th className="px-4 py-2">Progress</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {tiers.map((tier) => (
              <TierRow key={tier.id} tier={tier} />
            ))}
          </tbody>
        </table>
      </TableWrapper>
    </div>
  );
}

function TierRow({ tier }: { tier: AdminJackpotTier }) {
  const updateTier = useAdminUpdateTier();
  const forceDraw = useAdminForceDraw();
  const resetPool = useAdminResetPool();

  const [targetInput, setTargetInput] = useState(formatLaunch(tier.targetAmount));
  const [minGamesInput, setMinGamesInput] = useState(String(tier.minGames));
  const [dirty, setDirty] = useState(false);

  const handleSave = () => {
    // Convert LAUNCH display back to micro (× 1_000_000)
    const targetMicro = (BigInt(Math.round(Number(targetInput) * 1_000_000))).toString();
    const minGames = parseInt(minGamesInput, 10);
    if (Number.isNaN(minGames) || minGames < 0) return;

    updateTier.mutate({ tierId: tier.id, targetAmount: targetMicro, minGames }, {
      onSuccess: () => setDirty(false),
    });
  };

  const handleToggleActive = () => {
    updateTier.mutate({ tierId: tier.id, isActive: tier.isActive === 1 ? 0 : 1 });
  };

  const pool = tier.pool;

  return (
    <tr className="hover:bg-[var(--color-surface)]/50">
      <td className="px-4 py-2.5 font-medium">{TIER_LABELS[tier.name] ?? tier.name}</td>
      <td className="px-4 py-2.5">
        <input
          type="text"
          value={targetInput}
          onChange={(e) => { setTargetInput(e.target.value); setDirty(true); }}
          className="w-24 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          value={minGamesInput}
          onChange={(e) => { setMinGamesInput(e.target.value); setDirty(true); }}
          className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
        />
      </td>
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={handleToggleActive}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-colors ${
            tier.isActive === 1
              ? 'bg-green-500/15 text-green-400'
              : 'bg-gray-500/15 text-gray-400'
          }`}
        >
          {tier.isActive === 1 ? 'ON' : 'OFF'}
        </button>
      </td>
      <td className="px-4 py-2.5">
        {pool ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            pool.status === 'filling' ? 'bg-blue-500/15 text-blue-400'
              : pool.status === 'drawing' ? 'bg-amber-500/15 text-amber-400'
              : 'bg-gray-500/15 text-gray-400'
          }`}>
            {pool.status} #{pool.cycle}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--color-text-secondary)]">No pool</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs tabular-nums">
        {pool ? `${formatLaunch(pool.currentAmount)} / ${formatLaunch(tier.targetAmount)}` : '-'}
      </td>
      <td className="px-4 py-2.5">
        {pool ? (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-[var(--color-border)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${Math.min(100, pool.progress)}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--color-text-secondary)]">{pool.progress}%</span>
          </div>
        ) : '-'}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex gap-1.5">
          {dirty && (
            <ActionButton onClick={handleSave} variant="success" disabled={updateTier.isPending}>
              Save
            </ActionButton>
          )}
          {pool && pool.status === 'filling' && (
            <>
              <ActionButton
                onClick={() => forceDraw.mutate(pool.id)}
                variant="danger"
                disabled={forceDraw.isPending}
              >
                Draw
              </ActionButton>
              <ActionButton
                onClick={() => resetPool.mutate(pool.id)}
                variant="danger"
                disabled={resetPool.isPending}
              >
                Reset
              </ActionButton>
            </>
          )}
          {pool && pool.status === 'drawing' && (
            <ActionButton
              onClick={() => forceDraw.mutate(pool.id)}
              variant="danger"
              disabled={forceDraw.isPending}
            >
              Retry
            </ActionButton>
          )}
        </div>
      </td>
    </tr>
  );
}
