'use client';

import { useGetEventParticipants } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { UserAvatar } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { Users, Trophy } from 'lucide-react';

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
      {participants.map((p, i) => {
        const addr = String(p.address ?? '');
        const nickname = p.nickname as string | null;
        const isCurrentUser = address?.toLowerCase() === addr.toLowerCase();
        const status = String(p.status ?? 'joined');
        const isWinner = status === 'winner';
        const staggerClass = i < 10 ? `stagger-${i + 1}` : '';

        return (
          <div
            key={addr}
            className={`animate-fade-up ${staggerClass} flex items-center justify-between rounded-lg px-3 py-2 ${
              isWinner
                ? 'bg-amber-500/10 border border-amber-500/20'
                : isCurrentUser
                  ? 'bg-amber-500/8'
                  : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <UserAvatar address={addr} size={24} />
              <span className="text-xs font-medium">
                {nickname ?? shortAddr(addr)}
                {isCurrentUser && <span className="ml-1 text-amber-400">({t('leaderboard.you')})</span>}
              </span>
            </div>
            {isWinner && (
              <div className="flex items-center gap-1">
                <Trophy size={12} className="text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400">{t('events.winner')}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
