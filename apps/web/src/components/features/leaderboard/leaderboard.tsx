'use client';

import { useState } from 'react';
import { useLeaderboard, type LeaderboardEntry } from '@/hooks/use-leaderboard';
import { formatLaunch } from '@coinflip/shared/constants';
import { useWalletContext } from '@/contexts/wallet-context';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';

type SortBy = 'wins' | 'wagered' | 'win_rate';

const SORT_OPTION_IDS: SortBy[] = ['wins', 'wagered', 'win_rate'];

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function RankBadge({ rank }: { rank: number }) {
  const { t } = useTranslation();
  if (rank === 1)
    return <span className="text-base" title={t('leaderboard.firstPlace')}>&#129351;</span>;
  if (rank === 2)
    return <span className="text-base" title={t('leaderboard.secondPlace')}>&#129352;</span>;
  if (rank === 3)
    return <span className="text-base" title={t('leaderboard.thirdPlace')}>&#129353;</span>;
  return (
    <span className="text-xs font-bold text-[var(--color-text-secondary)] w-5 text-center">
      {rank}
    </span>
  );
}

function LeaderboardRow({
  entry,
  isCurrentUser,
  sortBy,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  sortBy: SortBy;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        isCurrentUser
          ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20'
          : 'hover:bg-[var(--color-surface)]/50'
      }`}
    >
      {/* Rank */}
      <div className="flex justify-center">
        <RankBadge rank={entry.rank} />
      </div>

      {/* Player info */}
      <div className="flex items-center gap-2 min-w-0">
        <UserAvatar address={entry.address} size={28} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {entry.nickname || shortAddr(entry.address)}
            {isCurrentUser && (
              <span className="ml-1.5 text-[10px] text-[var(--color-primary)] font-bold">{t('leaderboard.you')}</span>
            )}
          </p>
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            {t('leaderboard.betsCount', { count: entry.total_bets })}
          </p>
        </div>
      </div>

      {/* Main stat */}
      <div className="text-right">
        {sortBy === 'wins' && (
          <>
            <p className="text-sm font-bold tabular-nums">{entry.wins} W</p>
            <p className="text-[10px] text-[var(--color-text-secondary)]">
              {(entry.win_rate * 100).toFixed(0)}%
            </p>
          </>
        )}
        {sortBy === 'wagered' && (
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-sm font-bold tabular-nums">{formatLaunch(entry.total_wagered)}</span>
            <LaunchTokenIcon size={16} />
          </div>
        )}
        {sortBy === 'win_rate' && (
          <>
            <p className="text-sm font-bold tabular-nums">
              {(entry.win_rate * 100).toFixed(1)}%
            </p>
            <p className="text-[10px] text-[var(--color-text-secondary)]">
              {t('leaderboard.winsGames', { wins: entry.wins, total: entry.total_bets })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function Leaderboard() {
  const [sortBy, setSortBy] = useState<SortBy>('wins');
  const { data, isLoading, error } = useLeaderboard(sortBy);
  const { address } = useWalletContext();
  const { t } = useTranslation();

  const sortLabels: Record<SortBy, string> = {
    wins: t('leaderboard.wins'),
    wagered: t('leaderboard.volume'),
    win_rate: t('leaderboard.winRateTab'),
  };

  return (
    <div className="space-y-3">
      {/* Sort tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        {SORT_OPTION_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setSortBy(id)}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors active:scale-[0.98] ${
              sortBy === id
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
            }`}
          >
            {sortLabels[id]}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-[var(--color-danger)] text-center py-6">
          {t('leaderboard.failedToLoad')}
        </p>
      ) : !data?.length ? (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--color-text-secondary)]">{t('leaderboard.noPlayers')}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            {t('leaderboard.beFirst')}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {data.map((entry) => (
            <LeaderboardRow
              key={entry.address}
              entry={entry}
              isCurrentUser={!!address && entry.address.toLowerCase() === address.toLowerCase()}
              sortBy={sortBy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
