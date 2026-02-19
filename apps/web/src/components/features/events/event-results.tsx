'use client';

import { useGetEventResults } from '@coinflip/api-client';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { Trophy } from 'lucide-react';

interface EventResultsProps {
  eventId: string;
}

const RANK_ICONS = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
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

  return (
    <div className="space-y-3">
      {winners.map((winner) => {
        const rank = Number(winner.finalRank);
        const addr = String(winner.address ?? '');
        const amount = String(winner.prizeAmount ?? '0');
        const txHash = winner.prizeTxHash as string | null;

        return (
          <div
            key={addr}
            className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{RANK_ICONS[rank] ?? `#${rank}`}</span>
              <div className="flex items-center gap-2">
                <UserAvatar address={addr} size={28} />
                <span className="text-sm font-medium">{shortAddr(addr)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--color-success)]">{formatLaunch(amount)}</span>
              <LaunchTokenIcon size={36} />
              {txHash && (
                <span className="text-[10px] text-[var(--color-success)]">{t('events.paid')}</span>
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
