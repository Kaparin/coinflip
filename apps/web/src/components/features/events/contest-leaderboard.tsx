'use client';

import { useGetEventLeaderboard } from '@coinflip/api-client';
import { formatLaunch } from '@coinflip/shared/constants';
import { useWalletContext } from '@/contexts/wallet-context';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
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
      {entries.map((entry) => {
        const rank = Number(entry.rank);
        const addr = String(entry.address ?? '');
        const isCurrentUser = address?.toLowerCase() === addr.toLowerCase();
        const nickname = entry.nickname as string | null;

        return (
          <div
            key={addr}
            className={`grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-lg px-3 py-2.5 ${
              isCurrentUser ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30' : ''
            }`}
          >
            {/* Rank */}
            <div className="flex items-center justify-center">
              {rank <= 3 ? (
                <span className="text-base">{RANK_ICONS[rank]}</span>
              ) : (
                <span className="text-xs font-bold text-[var(--color-text-secondary)]">{rank}</span>
              )}
            </div>

            {/* Player info */}
            <div className="flex items-center gap-2 min-w-0">
              <UserAvatar address={addr} size={24} />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {nickname ?? shortAddr(addr)}
                  {isCurrentUser && <span className="ml-1 text-[var(--color-primary)]">({t('leaderboard.you')})</span>}
                </p>
                <p className="text-[10px] text-[var(--color-text-secondary)]">
                  {String(entry.games ?? 0)} games / {String(entry.wins ?? 0)} wins
                </p>
              </div>
            </div>

            {/* Metric value */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-sm font-bold tabular-nums">
                {formatLaunch(String(entry.turnover ?? '0'))}
              </span>
              <LaunchTokenIcon size={32} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
