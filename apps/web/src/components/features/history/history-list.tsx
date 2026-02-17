'use client';

import { useState, useMemo } from 'react';
import { useGetBetHistory, type Bet } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { Skeleton } from '@/components/ui/skeleton';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { formatLaunch, fromMicroLaunch, OPEN_BET_TTL_SECS } from '@coinflip/shared/constants';
import { useTranslation } from '@/lib/i18n';
import { EXPLORER_URL } from '@/lib/constants';
import { ChevronDown, ExternalLink, Trophy, Skull, Clock, Ban, Hourglass } from 'lucide-react';

type HistoryTab = 'games' | 'system' | 'all';

function truncAddr(addr: string): string {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

function formatDate(iso: string, t: (key: string, params?: Record<string, any>) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t('history.justNow');
  if (diffMins < 60) return t('history.minsAgo', { mins: diffMins });
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return t('history.hoursAgo', { hours: diffHrs });
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return t('history.daysAgo', { days: diffDays });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a
      href={`${EXPLORER_URL}/transactions/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] text-[var(--color-primary)] hover:underline"
    >
      {label}
      <ExternalLink size={10} />
    </a>
  );
}

function PlayerRow({
  address,
  nickname,
  isYou,
  roleLabel,
  isWinner,
}: {
  address: string;
  nickname: string | null;
  isYou: boolean;
  roleLabel: string;
  isWinner?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2.5">
      <UserAvatar address={address} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold truncate">
            {nickname || truncAddr(address)}
          </span>
          {isYou && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold">
              {t('history.you')}
            </span>
          )}
          {isWinner && (
            <Trophy size={12} className="text-[var(--color-warning)] shrink-0" />
          )}
        </div>
        <p className="text-[10px] text-[var(--color-text-secondary)]">{roleLabel}</p>
      </div>
    </div>
  );
}

function ExpandedDetails({ bet, address }: { bet: Bet; address: string }) {
  const { t } = useTranslation();
  const isMaker = bet.maker.toLowerCase() === address.toLowerCase();
  const isResolved = bet.status === 'revealed' || bet.status === 'timeout_claimed';
  const betAmountMicro = Number(bet.amount);
  const payoutMicro = Number(bet.payout_amount ?? 0);
  const commissionMicro = Number(bet.commission_amount ?? 0);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)]/50 space-y-3">
      {/* Players */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <PlayerRow
            address={bet.maker}
            nickname={bet.maker_nickname}
            isYou={isMaker}
            roleLabel={t('history.maker')}
            isWinner={isResolved && bet.winner?.toLowerCase() === bet.maker.toLowerCase()}
          />
        </div>
        <div>
          {bet.acceptor ? (
            <PlayerRow
              address={bet.acceptor}
              nickname={bet.acceptor_nickname}
              isYou={!isMaker}
              roleLabel={t('history.acceptorLabel')}
              isWinner={isResolved && bet.winner?.toLowerCase() === bet.acceptor.toLowerCase()}
            />
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[var(--color-border)]/30 flex items-center justify-center">
                <Hourglass size={14} className="text-[var(--color-text-secondary)]" />
              </div>
              <span className="text-xs text-[var(--color-text-secondary)] italic">
                {t('history.noOpponent')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Game details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        {/* Bet amount */}
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-text-secondary)]">{t('history.betAmount')}</span>
          <span className="font-semibold tabular-nums flex items-center gap-1">
            {formatLaunch(betAmountMicro)} <LaunchTokenIcon size={12} />
          </span>
        </div>

        {/* Acceptor side */}
        {bet.acceptor_guess && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">{t('history.side')}</span>
            <span className="font-semibold">
              {bet.acceptor_guess === 'heads' ? `🪙 ${t('history.heads')}` : `🪙 ${t('history.tails')}`}
            </span>
          </div>
        )}

        {/* Payout */}
        {isResolved && payoutMicro > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">{t('history.payout')}</span>
            <span className="font-semibold tabular-nums text-[var(--color-success)] flex items-center gap-1">
              {formatLaunch(payoutMicro)} <LaunchTokenIcon size={12} />
            </span>
          </div>
        )}

        {/* Commission */}
        {isResolved && commissionMicro > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">{t('history.commission')}</span>
            <span className="font-semibold tabular-nums flex items-center gap-1">
              {formatLaunch(commissionMicro)} <LaunchTokenIcon size={12} />
            </span>
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--color-text-secondary)]">
        <span>{t('history.createdAt')}: {formatFullDate(bet.created_at)}</span>
        {bet.accepted_at && (
          <span>{t('history.acceptedAt')}: {formatFullDate(bet.accepted_at)}</span>
        )}
        {bet.resolved_at && (
          <span>{t('history.resolvedAt')}: {formatFullDate(bet.resolved_at)}</span>
        )}
      </div>

      {/* TX links */}
      <div className="flex flex-wrap gap-3">
        {bet.txhash_create && (
          <TxLink hash={bet.txhash_create} label={t('history.txCreate')} />
        )}
        {bet.txhash_accept && (
          <TxLink hash={bet.txhash_accept} label={t('history.txAccept')} />
        )}
        {bet.txhash_resolve && (
          <TxLink hash={bet.txhash_resolve} label={t('history.txResolve')} />
        )}
      </div>
    </div>
  );
}

export function HistoryList() {
  const [tab, setTab] = useState<HistoryTab>('games');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { address, isConnected } = useWalletContext();
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useGetBetHistory(
    { limit: 100 },
    { query: { enabled: isConnected } },
  );

  const bets = data?.data ?? [];

  const { gameBets, systemBets } = useMemo(() => {
    const games: Bet[] = [];
    const system: Bet[] = [];

    for (const bet of bets) {
      const isResolved = bet.status === 'revealed' || bet.status === 'timeout_claimed';
      if (isResolved) {
        games.push(bet);
      } else {
        system.push(bet);
      }
    }

    return { gameBets: games, systemBets: system };
  }, [bets]);

  const displayBets = tab === 'games' ? gameBets : tab === 'system' ? systemBets : bets;

  const stats = useMemo(() => {
    let wins = 0, losses = 0, totalWonMicro = 0, totalLostMicro = 0;
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
      {/* Stats bar */}
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
      <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.98] ${
              tab === tabItem.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {tabItem.label}
            {tabItem.count > 0 && (
              <span className={`ml-1 ${tab === tabItem.id ? 'text-white/70' : 'text-[var(--color-text-secondary)]/50'}`}>
                {tabItem.count}
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
            const isWinner = isResolved && bet.winner?.toLowerCase() === address?.toLowerCase();
            const isMaker = bet.maker.toLowerCase() === address?.toLowerCase();
            const payoutMicro = Number(bet.payout_amount ?? 0);
            const betAmountMicro = Number(bet.amount);
            const isExpanded = expandedId === bet.id;

            const opponentAddr = isMaker ? bet.acceptor : bet.maker;
            const opponentNick = isMaker ? bet.acceptor_nickname : bet.maker_nickname;

            let IconComponent: typeof Trophy;
            let borderClass: string;
            let bgClass: string;
            let label: string;
            let resultText: string | null = null;
            let resultColor: string = '';

            if (isResolved) {
              IconComponent = isWinner ? Trophy : Skull;
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
              const betAgeMs = Date.now() - new Date(bet.created_at).getTime();
              const isExpired = betAgeMs >= OPEN_BET_TTL_SECS * 1000 * 0.95;
              IconComponent = isExpired ? Clock : Ban;
              borderClass = 'border-zinc-500/20';
              bgClass = 'bg-zinc-500/5';
              label = isExpired ? t('bets.expired') : t('history.canceledStatus');
              resultText = t('history.refunded');
              resultColor = 'text-[var(--color-text-secondary)]';
            } else if (bet.status === 'timeout_claimed') {
              IconComponent = Clock;
              borderClass = 'border-amber-500/20';
              bgClass = 'bg-amber-500/5';
              label = t('history.timeoutStatus');
            } else {
              IconComponent = Hourglass;
              borderClass = 'border-[var(--color-border)]';
              bgClass = 'bg-[var(--color-surface)]';
              label = bet.status === 'accepted' ? t('history.inProgressStatus') :
                      bet.status === 'accepting' ? t('history.acceptingStatus') : t('history.openStatus');
            }

            return (
              <div
                key={bet.id}
                className={`rounded-xl border transition-all ${borderClass} ${bgClass} ${
                  isExpanded ? 'ring-1 ring-[var(--color-primary)]/20' : ''
                }`}
              >
                {/* Collapsed row — clickable */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : bet.id)}
                  className="w-full flex items-center gap-3 p-3 text-left cursor-pointer"
                >
                  {/* Icon */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isResolved
                      ? isWinner ? 'bg-[var(--color-success)]/15' : 'bg-[var(--color-danger)]/15'
                      : isCanceled ? 'bg-zinc-500/15' : 'bg-[var(--color-bg)]'
                  }`}>
                    <IconComponent
                      size={16}
                      className={
                        isResolved
                          ? isWinner ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                          : isCanceled ? 'text-zinc-400' : 'text-[var(--color-text-secondary)]'
                      }
                    />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums">{formatLaunch(betAmountMicro)}</span>
                      <LaunchTokenIcon size={16} />
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                        isResolved
                          ? isWinner ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                          : isCanceled ? 'bg-zinc-500/10 text-zinc-400' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      }`}>
                        {label}
                      </span>
                    </div>
                    {/* Opponent info with avatar */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {opponentAddr ? (
                        <>
                          <UserAvatar address={opponentAddr} size={14} />
                          <span className="text-[10px] text-[var(--color-text-secondary)] truncate">
                            {t('history.vs')}{' '}
                            {opponentNick || truncAddr(opponentAddr)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-[var(--color-text-secondary)]">
                          {isMaker ? t('history.created') : t('history.accepted')}
                        </span>
                      )}
                      <span className="text-[10px] text-[var(--color-text-secondary)]">
                        · {formatDate(bet.created_at, t)}
                      </span>
                    </div>
                  </div>

                  {/* Result + chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    {resultText && (
                      <p className={`text-sm font-bold tabular-nums ${resultColor}`}>
                        {resultText}
                      </p>
                    )}
                    <ChevronDown
                      size={14}
                      className={`text-[var(--color-text-secondary)] transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && address && (
                  <div className="px-3 pb-3">
                    <ExpandedDetails bet={bet} address={address} />
                  </div>
                )}
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
