'use client';

import { useState, useMemo } from 'react';
import { useGetBetHistory } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { Skeleton } from '@/components/ui/skeleton';
import { LaunchTokenIcon } from '@/components/ui';
import { formatLaunch, fromMicroLaunch, OPEN_BET_TTL_SECS } from '@coinflip/shared/constants';
import { useTranslation } from '@/lib/i18n';

type HistoryTab = 'games' | 'system' | 'all';

function truncAddr(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : addr;
}

function formatDate(iso: string, t: (key: string, params?: Record<string, any>) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t('history.justNow');
  if (diffMins < 60) return t('history.minsAgo', { mins: diffMins });
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return t('history.hrsAgo', { hrs: diffHrs });
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return t('history.daysAgo', { days: diffDays });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function HistoryList() {
  const [tab, setTab] = useState<HistoryTab>('games');
  const { address, isConnected } = useWalletContext();
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useGetBetHistory(
    { limit: 100 },
    { query: { enabled: isConnected } },
  );

  const bets = data?.data ?? [];

  // Separate bets into games (resolved wins/losses) vs system (cancels, timeouts, pending)
  const { gameBets, systemBets } = useMemo(() => {
    const games: typeof bets = [];
    const system: typeof bets = [];

    for (const bet of bets) {
      const isResolved = bet.status === 'revealed' || bet.status === 'timeout_claimed';
      if (isResolved) {
        games.push(bet);
      } else {
        // canceled, canceling, open, accepted, accepting — these are "system" events
        system.push(bet);
      }
    }

    return { gameBets: games, systemBets: system };
  }, [bets]);

  const displayBets = tab === 'games' ? gameBets : tab === 'system' ? systemBets : bets;

  // Stats — only from game bets (resolved)
  const stats = useMemo(() => {
    let wins = 0, losses = 0, totalWonMicro = 0, totalLostMicro = 0;
    for (const bet of gameBets) {
      const isWinner = (bet as any).winner === address;
      if (isWinner) {
        wins++;
        totalWonMicro += Number((bet as any).payout_amount ?? 0);
      } else {
        losses++;
        totalLostMicro += Number(bet.amount ?? 0);
      }
    }
    const netMicro = totalWonMicro - totalLostMicro;
    return {
      wins,
      losses,
      totalWonHuman: fromMicroLaunch(totalWonMicro),
      totalLostHuman: fromMicroLaunch(totalLostMicro),
      netHuman: fromMicroLaunch(netMicro),
      total: gameBets.length,
      winRate: gameBets.length > 0 ? Math.round((wins / gameBets.length) * 100) : 0,
    };
  }, [gameBets, address]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-12 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('history.connectToView')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-border)] py-12">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('history.failedToLoad')}</p>
        <button onClick={() => void refetch()} className="rounded-lg bg-[var(--color-surface)] px-4 py-2 text-xs font-medium">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const fmtHuman = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const TABS: { id: HistoryTab; label: string; count: number }[] = [
    { id: 'games', label: t('history.gamesTab'), count: gameBets.length },
    { id: 'system', label: t('history.systemTab'), count: systemBets.length },
    { id: 'all', label: t('history.allTab'), count: bets.length },
  ];

  return (
    <div>
      {/* Stats bar — only shown on Games tab */}
      {tab === 'games' && stats.total > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5 text-center">
            <p className="text-[10px] uppercase text-[var(--color-text-secondary)]">{t('history.games')}</p>
            <p className="text-lg font-bold">{stats.total}</p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5 text-center">
            <p className="text-[10px] uppercase text-[var(--color-text-secondary)]">{t('history.winRate')}</p>
            <p className="text-lg font-bold text-[var(--color-primary)]">{stats.winRate}%</p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5 text-center">
            <p className="text-[10px] uppercase text-[var(--color-text-secondary)]">{stats.wins}W / {stats.losses}L</p>
            <p className="text-lg font-bold">
              <span className="text-[var(--color-success)]">{stats.wins}</span>
              <span className="text-[var(--color-text-secondary)] mx-0.5">/</span>
              <span className="text-[var(--color-danger)]">{stats.losses}</span>
            </p>
          </div>
          <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5 text-center">
            <p className="text-[10px] uppercase text-[var(--color-text-secondary)]">{t('history.netPnl')}</p>
            <p className={`text-lg font-bold ${stats.netHuman >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
              {stats.netHuman >= 0 ? '+' : ''}{fmtHuman(stats.netHuman)}
            </p>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1 ${tab === t.id ? 'text-white/70' : 'text-[var(--color-text-secondary)]/50'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bet rows */}
      {displayBets.length > 0 ? (
        <div className="space-y-2">
          {displayBets.map((bet) => {
            const isResolved = bet.status === 'revealed' || bet.status === 'timeout_claimed';
            const isCanceled = bet.status === 'canceled' || (bet.status as string) === 'canceling';
            const isWinner = isResolved && (bet as any).winner === address;
            const isMaker = bet.maker === address;
            const payoutMicro = Number((bet as any).payout_amount ?? 0);
            const betAmountMicro = Number(bet.amount);

            // Determine the event icon and styling
            let icon: string;
            let borderClass: string;
            let bgClass: string;
            let label: string;
            let resultText: string | null = null;
            let resultColor: string = '';

            if (isResolved) {
              icon = isWinner ? '🏆' : '💀';
              borderClass = isWinner ? 'border-[var(--color-success)]/20' : 'border-[var(--color-danger)]/20';
              bgClass = isWinner ? 'bg-[var(--color-success)]/5' : 'bg-[var(--color-danger)]/5';
              label = isWinner ? t('history.win') : t('history.loss');

              if (isWinner) {
                const profit = payoutMicro - betAmountMicro;
                resultText = `+${fmtHuman(fromMicroLaunch(profit))}`;
                resultColor = 'text-[var(--color-success)]';
              } else {
                resultText = `-${fmtHuman(fromMicroLaunch(betAmountMicro))}`;
                resultColor = 'text-[var(--color-danger)]';
              }
            } else if (isCanceled) {
              // Distinguish expired (auto-cancel after 12h) from manual cancels
              const betAgeMs = Date.now() - new Date(bet.created_at).getTime();
              const isExpired = betAgeMs >= OPEN_BET_TTL_SECS * 1000 * 0.95; // ~11.4h+ is "expired"
              icon = isExpired ? '⏰' : '🚫';
              borderClass = 'border-zinc-500/20';
              bgClass = 'bg-zinc-500/5';
              label = isExpired ? t('bets.expired') : t('history.canceledStatus');
              resultText = t('history.refunded');
              resultColor = 'text-[var(--color-text-secondary)]';
            } else if (bet.status === 'timeout_claimed') {
              icon = '⏰';
              borderClass = 'border-amber-500/20';
              bgClass = 'bg-amber-500/5';
              label = t('history.timeoutStatus');
            } else {
              icon = '⏳';
              borderClass = 'border-[var(--color-border)]';
              bgClass = 'bg-[var(--color-surface)]';
              label = bet.status === 'accepted' ? t('history.inProgressStatus') :
                      bet.status === 'accepting' ? t('history.acceptingStatus') : t('history.openStatus');
            }

            return (
              <div
                key={bet.id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${borderClass} ${bgClass}`}
              >
                {/* Event icon */}
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${
                  isResolved
                    ? isWinner ? 'bg-[var(--color-success)]/15' : 'bg-[var(--color-danger)]/15'
                    : isCanceled ? 'bg-zinc-500/15' : 'bg-[var(--color-bg)]'
                }`}>
                  {icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums">{formatLaunch(betAmountMicro)}</span>
                    <LaunchTokenIcon size={48} />
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                      isResolved
                        ? isWinner ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                        : isCanceled ? 'bg-zinc-500/10 text-zinc-400' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    }`}>
                      {label}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--color-text-secondary)]">
                    {isMaker ? t('history.created') : t('history.accepted')}
                    {' ' + t('history.vs') + ' '}
                    {truncAddr(isMaker ? ((bet as any).acceptor ?? '...') : bet.maker)}
                    {' · '}
                    {formatDate(bet.created_at, t)}
                  </div>
                </div>

                {/* Result */}
                <div className="text-right shrink-0">
                  {resultText && (
                    <p className={`text-sm font-bold tabular-nums ${resultColor}`}>
                      {resultText}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-12 text-center">
          <span className="text-3xl block mb-2">
            {tab === 'games' ? '🎮' : tab === 'system' ? '⚙️' : '📋'}
          </span>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {tab === 'games' ? t('history.noGames') :
             tab === 'system' ? t('history.noSystemEvents') :
             t('history.noHistory')}
          </p>
        </div>
      )}
    </div>
  );
}
