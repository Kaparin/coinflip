'use client';

import { useMemo } from 'react';
import { useGetBetHistory } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { fromMicroLaunch } from '@coinflip/shared/constants';
import { useTranslation } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';

/** Normalize status for comparison (API may return different casing) */
function isResolvedStatus(s: string | undefined): boolean {
  const lower = (s ?? '').toLowerCase();
  return lower === 'revealed' || lower === 'timeout_claimed';
}

export function GameStatsSection() {
  const { address, isConnected } = useWalletContext();
  const { t } = useTranslation();
  // Use same limit as HistoryList so React Query cache is shared
  const { data, isLoading, error, refetch } = useGetBetHistory(
    { limit: 100 },
    { query: { enabled: isConnected } },
  );

  const bets = data?.data ?? [];
  const gameBets = useMemo(() => {
    return bets.filter((b) => isResolvedStatus(b.status));
  }, [bets]);

  const stats = useMemo(() => {
    let wins = 0,
      losses = 0,
      totalWonMicro = 0,
      totalLostMicro = 0;
    for (const bet of gameBets) {
      const isWinner = bet.winner?.toLowerCase() === address?.toLowerCase();
      if (isWinner) {
        wins++;
        totalWonMicro += Number(bet.payout_amount ?? 0);
      } else {
        losses++;
        totalLostMicro += Number(bet.amount ?? 0);
      }
    }
    const netMicro = totalWonMicro - totalLostMicro;
    return {
      wins,
      losses,
      total: gameBets.length,
      winRate: gameBets.length > 0 ? Math.round((wins / gameBets.length) * 100) : 0,
      netHuman: fromMicroLaunch(netMicro),
    };
  }, [gameBets, address]);

  const fmtHuman = (n: number) =>
    n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  if (!isConnected) return null;

  if (isLoading) {
    return (
      <div className="overflow-x-auto scrollbar-hide -mx-1">
        <div className="flex gap-2 min-w-max px-1">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-24 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('history.failedToLoad')}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg bg-[var(--color-surface)] px-4 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] py-2">
        {t('history.noGames')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-1">
      <div className="flex gap-2 min-w-max px-1 pb-1">
        <div className="shrink-0 w-24 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-2.5 text-center min-w-0">
          <p className="text-[9px] uppercase text-[var(--color-text-secondary)] truncate">
            {t('history.games')}
          </p>
          <p className="text-sm font-bold truncate">{stats.total}</p>
        </div>
        <div className="shrink-0 w-24 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-2.5 text-center min-w-0">
          <p className="text-[9px] uppercase text-[var(--color-text-secondary)] truncate">
            {t('history.winRate')}
          </p>
          <p className="text-sm font-bold text-[var(--color-primary)] truncate">
            {stats.winRate}%
          </p>
        </div>
        <div className="shrink-0 w-24 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-2.5 text-center min-w-0">
          <p className="text-[9px] uppercase text-[var(--color-text-secondary)] truncate">
            W / L
          </p>
          <p className="text-sm font-bold">
            <span className="text-[var(--color-success)]">{stats.wins}</span>
            <span className="text-[var(--color-text-secondary)] mx-0.5">/</span>
            <span className="text-[var(--color-danger)]">{stats.losses}</span>
          </p>
        </div>
        <div className="shrink-0 w-24 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-2.5 text-center min-w-0">
          <p className="text-[9px] uppercase text-[var(--color-text-secondary)] truncate">
            {t('history.netPnl')}
          </p>
          <p
            className={`text-sm font-bold truncate ${
              stats.netHuman >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
            }`}
            title={`${stats.netHuman >= 0 ? '+' : ''}${fmtHuman(stats.netHuman)}`}
          >
            {stats.netHuman >= 0 ? '+' : ''}
            {fmtHuman(stats.netHuman)}
          </p>
        </div>
      </div>
    </div>
  );
}
