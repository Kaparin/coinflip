'use client';

import { useGetEventLeaderboard } from '@coinflip/api-client';
import { formatLaunch } from '@coinflip/shared/constants';
import { useWalletContext } from '@/contexts/wallet-context';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { VipAvatarFrame, getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';

interface ContestLeaderboardProps {
  eventId: string;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

const RANK_ICONS = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];

function getTopRankStyle(rank: number): string {
  if (rank === 1) return 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 border-glow-raffle';
  if (rank === 2) return 'bg-gradient-to-r from-slate-400/8 via-slate-400/4 to-transparent border border-slate-400/15';
  if (rank === 3) return 'bg-gradient-to-r from-amber-700/8 via-amber-700/4 to-transparent border border-amber-700/15';
  return '';
}

function getMetricValue(entry: Record<string, unknown>): { label: string; value: string } {
  const metric = entry.metric as string | undefined;
  if (metric === 'wins') return { label: 'wins', value: String(entry.wins ?? '0') };
  if (metric === 'profit') return { label: 'profit', value: String(entry.profit ?? '0') };
  return { label: 'turnover', value: String(entry.turnover ?? '0') };
}

export function ContestLeaderboard({ eventId }: ContestLeaderboardProps) {
  const { t } = useTranslation();
  const { address } = useWalletContext();
  const { data, isLoading } = useGetEventLeaderboard(eventId, { limit: 50 }, {
    query: { staleTime: 30_000, refetchInterval: 60_000 },
  });

  const entries = (data as unknown as { data: Array<Record<string, unknown>>; total: number })?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
        {t('events.noLeaderboardData')}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => {
        const rank = Number(entry.rank);
        const addr = String(entry.address ?? '');
        const isCurrentUser = address?.toLowerCase() === addr.toLowerCase();
        const nickname = entry.nickname as string | null;
        const isTopThree = rank <= 3;
        const topStyle = getTopRankStyle(rank);
        const staggerClass = i < 10 ? `stagger-${i + 1}` : '';
        const { label: metricLabel, value: metricValue } = getMetricValue(entry);

        return (
          <div
            key={addr}
            className={`animate-fade-up ${staggerClass} grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-lg ${
              isTopThree ? `${topStyle} px-3 py-3` : 'px-3 py-2.5'
            } ${
              isCurrentUser && !isTopThree ? 'bg-indigo-500/10 border border-indigo-500/20' : ''
            }`}
          >
            {/* Rank */}
            <div className="flex items-center justify-center">
              {rank <= 3 ? (
                <span className={`${rank === 1 ? 'text-lg animate-float-up' : 'text-base'}`}>
                  {RANK_ICONS[rank]}
                </span>
              ) : (
                <span className="text-xs font-bold text-[var(--color-text-secondary)]">{rank}</span>
              )}
            </div>

            {/* Player info */}
            <div className="flex items-center gap-2 min-w-0">
              <VipAvatarFrame tier={entry.vip_tier as string | null}>
                <UserAvatar address={addr} size={isTopThree ? 28 : 24} />
              </VipAvatarFrame>
              <div className="min-w-0">
                <p className={`font-medium truncate ${rank === 1 ? 'text-sm' : 'text-xs'} ${getVipNameClass(entry.vip_tier as string | null)}`}>
                  {nickname ?? shortAddr(addr)}
                  {isCurrentUser && <span className="ml-1 text-indigo-400">({t('leaderboard.you')})</span>}
                </p>
                <p className="text-[10px] text-[var(--color-text-secondary)]">
                  {String(entry.games ?? 0)} games / {String(entry.wins ?? 0)} wins
                </p>
              </div>
            </div>

            {/* Metric value */}
            <div className="flex items-center gap-1 shrink-0">
              <div className="text-right">
                <span className={`font-bold tabular-nums ${rank === 1 ? 'text-base' : 'text-sm'}`}>
                  {metricLabel === 'wins' ? metricValue : formatLaunch(metricValue)}
                </span>
                <p className="text-[9px] text-[var(--color-text-secondary)] uppercase">{metricLabel}</p>
              </div>
              <LaunchTokenIcon size={rank === 1 ? 36 : 32} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
