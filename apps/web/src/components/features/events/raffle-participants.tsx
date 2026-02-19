'use client';

import { useGetEventParticipants } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { UserAvatar } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { Users } from 'lucide-react';

interface RaffleParticipantsProps {
  eventId: string;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export function RaffleParticipants({ eventId }: RaffleParticipantsProps) {
  const { t } = useTranslation();
  const { address } = useWalletContext();
  const { data, isLoading } = useGetEventParticipants(eventId, { limit: 100 }, {
    query: { staleTime: 30_000 },
  });

  const participants = (data as unknown as { data: Array<Record<string, unknown>> })?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Users size={24} className="mb-2 text-[var(--color-text-secondary)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.noParticipants')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-[var(--color-text-secondary)] mb-2">
        {participants.length} {t('events.participants')}
      </p>
      {participants.map((p) => {
        const addr = String(p.address ?? '');
        const nickname = p.nickname as string | null;
        const isCurrentUser = address?.toLowerCase() === addr.toLowerCase();
        const status = String(p.status ?? 'joined');

        return (
          <div
            key={addr}
            className={`flex items-center justify-between rounded-lg px-3 py-2 ${
              isCurrentUser ? 'bg-[var(--color-primary)]/10' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <UserAvatar address={addr} size={24} />
              <span className="text-xs font-medium">
                {nickname ?? shortAddr(addr)}
                {isCurrentUser && <span className="ml-1 text-[var(--color-primary)]">({t('leaderboard.you')})</span>}
              </span>
            </div>
            {status === 'winner' && (
              <span className="text-[10px] font-bold text-[var(--color-success)]">{t('events.winner')}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
