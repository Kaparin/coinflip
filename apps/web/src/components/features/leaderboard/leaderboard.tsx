'use client';

import { useState } from 'react';
import { useLeaderboard, type LeaderboardEntry } from '@/hooks/use-leaderboard';
import { formatLaunch } from '@coinflip/shared/constants';
import { useWalletContext } from '@/contexts/wallet-context';
import { GameTokenIcon, UserAvatar } from '@/components/ui';
import { VipAvatarFrame, getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { Trophy, Flame } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';

type SortBy = 'wins' | 'wagered' | 'win_rate';

const SORT_OPTION_IDS: SortBy[] = ['wins', 'wagered', 'win_rate'];

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const medals = ['🥇', '🥈', '🥉'];
    const glowColors = [
      'shadow-[0_0_12px_rgba(251,191,36,0.3)]',
      'shadow-[0_0_10px_rgba(156,163,175,0.25)]',
      'shadow-[0_0_10px_rgba(251,146,60,0.25)]',
    ];
    return (
      <span className={`text-lg w-7 h-7 flex items-center justify-center rounded-full ${glowColors[rank - 1]}`}>
        {medals[rank - 1]}
      </span>
    );
  }
  return (
    <span className="text-xs font-bold text-[var(--color-text-secondary)] w-7 h-7 flex items-center justify-center">
      {rank}
    </span>
  );
}

function LeaderboardRow({
  entry,
  isCurrentUser,
  sortBy,
  index,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  sortBy: SortBy;
  index: number;
}) {
  const { t } = useTranslation();
  const isTop3 = entry.rank <= 3;

  return (
    <Link
      href={`/game/profile/${entry.address}`}
      className={`interactive-card grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-xl animate-fade-up ${
        isCurrentUser
          ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20'
          : isTop3
            ? 'bg-[var(--color-warning)]/[0.03] border border-[var(--color-warning)]/10'
            : 'border border-transparent hover:bg-[var(--color-surface)]'
      }`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Rank */}
      <div className="flex justify-center">
        <RankBadge rank={entry.rank} />
      </div>

      {/* Player info */}
      <div className="flex items-center gap-2 min-w-0">
        <VipAvatarFrame tier={entry.vip_tier} frameStyle={entry.vip_customization?.frameStyle}>
          <UserAvatar address={entry.address} size={28} />
        </VipAvatarFrame>
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${getVipNameClass(entry.vip_tier, entry.vip_customization?.nameGradient)}`}>
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
      <div className="text-right shrink-0">
        {sortBy === 'wins' && (
          <>
            <p className="text-sm font-bold tabular-nums flex items-center justify-end gap-1">
              {entry.wins}
              <span className="text-emerald-400 text-xs">W</span>
            </p>
            <p className="text-[10px] text-[var(--color-text-secondary)]">
              {(entry.win_rate * 100).toFixed(0)}%
            </p>
          </>
        )}
        {sortBy === 'wagered' && (
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-sm font-bold tabular-nums">{formatLaunch(entry.total_wagered)}</span>
            <GameTokenIcon size={16} />
          </div>
        )}
        {sortBy === 'win_rate' && (
          <>
            <p className="text-sm font-bold tabular-nums flex items-center justify-end gap-1">
              {(entry.win_rate * 100).toFixed(1)}%
              {entry.win_rate >= 0.6 && <Flame size={12} className="text-orange-400" />}
            </p>
            <p className="text-[10px] text-[var(--color-text-secondary)]">
              {t('leaderboard.winsGames', { wins: entry.wins, total: entry.total_bets })}
            </p>
          </>
        )}
      </div>
    </Link>
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
            className={`tab-indicator shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg ${
              sortBy === id
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
            }`}
            data-active={sortBy === id}
          >
            {sortLabels[id]}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-[var(--color-danger)] text-center py-6">
          {t('leaderboard.failedToLoad')}
        </p>
      ) : !data?.length ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] py-12 text-center animate-fade-up">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] mx-auto mb-3">
            <Trophy size={32} strokeWidth={1.5} />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">{t('leaderboard.noPlayers')}</p>
          <p className="text-xs text-[var(--color-text-secondary)]/60 mt-1">
            {t('leaderboard.beFirst')}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {data.map((entry, i) => (
            <LeaderboardRow
              key={entry.address}
              entry={entry}
              isCurrentUser={!!address && entry.address.toLowerCase() === address.toLowerCase()}
              sortBy={sortBy}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
