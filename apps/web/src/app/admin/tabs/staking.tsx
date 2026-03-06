'use client';

import { useState } from 'react';
import { Loader2, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import {
  useAdminStakingStats,
  useAdminStakingFlush,
} from '@/hooks/use-admin';
import { StatCard, ActionButton } from '../_shared';

export function StakingTab() {
  const { data: stats, isLoading } = useAdminStakingStats();
  const flush = useAdminStakingFlush();
  const [lastResult, setLastResult] = useState<{ txHash: string; amount: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  const pendingAmount = stats?.pendingAmount ?? '0';
  const hasPending = BigInt(pendingAmount) > 0n;

  const handleFlush = async () => {
    setError(null);
    setLastResult(null);
    try {
      const result = await flush.mutateAsync();
      setLastResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Flush failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Всего накоплено"
          value={formatLaunch(stats?.totalAccumulated ?? '0')}
          sub={`${stats?.totalEntries ?? 0} записей`}
        />
        <StatCard
          label="Ожидает отправки"
          value={formatLaunch(pendingAmount)}
          sub={`${stats?.pendingEntries ?? 0} записей`}
          warn={hasPending}
        />
        <StatCard
          label="Отправлено"
          value={formatLaunch(stats?.flushedAmount ?? '0')}
          sub={`${stats?.flushedEntries ?? 0} записей`}
        />
        <StatCard
          label="Ставка для стейкеров"
          value="20%"
          sub="от комиссии"
        />
      </div>

      {/* Info */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold mb-2">Как это работает</h3>
        <div className="text-xs text-[var(--color-text-secondary)] space-y-1">
          <p>1. При каждом завершении ставки 20% от комиссии записывается в staking_ledger со статусом "pending"</p>
          <p>2. Накопленная сумма отображается выше как "Ожидает отправки"</p>
          <p>3. Нажмите "Отправить в контракт" чтобы перевести AXM в стейкинг-контракт</p>
          <p>4. Контракт автоматически распределит AXM пропорционально стейкам держателей LAUNCH</p>
        </div>
      </div>

      {/* Flush Action */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Отправить в стейкинг-контракт</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Отправит {formatLaunch(pendingAmount)} AXM через distribute()
            </p>
          </div>
          <ActionButton
            onClick={handleFlush}
            disabled={!hasPending || flush.isPending}
            variant="success"
          >
            {flush.isPending ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Отправка...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Send size={12} />
                Отправить в контракт
              </span>
            )}
          </ActionButton>
        </div>

        {/* Result */}
        {lastResult && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="text-green-400 font-medium">Успешно отправлено {formatLaunch(lastResult.amount)} AXM</p>
              <p className="text-[var(--color-text-secondary)] font-mono mt-1">TX: {lastResult.txHash}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
