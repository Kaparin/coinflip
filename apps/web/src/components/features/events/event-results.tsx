'use client';

import { useGetEventResults } from '@coinflip/api-client';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { Trophy, CheckCircle, Crown } from 'lucide-react';

interface EventResultsProps {
  eventId: string;
  eventType?: string;
}

const RANK_ICONS = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function getWinnerStyle(rank: number): string {
  if (rank === 1) return 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-glow-raffle';
  if (rank === 2) return 'border-slate-400/20 bg-gradient-to-r from-slate-400/8 to-transparent';
  if (rank === 3) return 'border-amber-700/20 bg-gradient-to-r from-amber-700/8 to-transparent';
  return '';
}

export function EventResults({ eventId }: EventResultsProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useGetEventResults(eventId, {
    query: { staleTime: 60_000 },
  });

  const response = data as unknown as { data?: { winners?: Array<Record<string, unknown>>; raffleSeed?: string } };
  const winners = response?.data?.winners ?? [];
  const raffleSeed = response?.data?.raffleSeed;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (winners.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Trophy size={24} className="mb-2 text-[var(--color-text-secondary)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.noResults')}</p>
      </div>
    );
  }

  // Sort by rank to ensure correct display order
  const sortedWinners = [...winners].sort((a, b) => Number(a.finalRank) - Number(b.finalRank));

  return (
    <div className="space-y-3">
      {sortedWinners.map((winner, i) => {
        const rank = Number(winner.finalRank);
        const addr = String(winner.address ?? '');
        const amount = String(winner.prizeAmount ?? '0');
        const txHash = winner.prizeTxHash as string | null;
        const isFirst = rank === 1;
        const winnerStyle = getWinnerStyle(rank);

        return (
          <div
            key={addr}
            className={`animate-winner-reveal relative flex items-center justify-between overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] ${
              isFirst ? 'px-4 py-4' : 'px-4 py-3'
            } ${winnerStyle}`}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            {/* Crown decoration for 1st place */}
            {isFirst && (
              <Crown
                size={48}
                className="absolute -top-1 -right-1 opacity-[0.06] text-amber-400"
                strokeWidth={1}
              />
            )}

            <div className="relative flex items-center gap-3">
              <span className={isFirst ? 'text-xl' : 'text-lg'}>{RANK_ICONS[rank] ?? `#${rank}`}</span>
              <div className="flex items-center gap-2">
                <UserAvatar address={addr} size={isFirst ? 32 : 28} />
                <span className={`font-medium ${isFirst ? 'text-base' : 'text-sm'}`}>{shortAddr(addr)}</span>
              </div>
            </div>
            <div className="relative flex items-center gap-2">
              <span className={`font-bold text-[var(--color-success)] ${isFirst ? 'text-base' : 'text-sm'}`}>
                {formatLaunch(amount)}
              </span>
              <LaunchTokenIcon size={isFirst ? 40 : 36} />
              {txHash && (
                <CheckCircle size={14} className="text-[var(--color-success)] animate-scale-in" />
              )}
            </div>
          </div>
        );
      })}

      {raffleSeed && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1">
            {t('events.raffleSeed')}
          </p>
          <p className="text-[10px] font-mono break-all text-[var(--color-text-secondary)]">{raffleSeed}</p>
        </div>
      )}
    </div>
  );
}
