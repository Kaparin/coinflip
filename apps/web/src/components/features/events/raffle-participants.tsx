'use client';

import { useState } from 'react';
import { useGetEventParticipants } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { UserAvatar } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { Users, ChevronDown } from 'lucide-react';

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
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useGetEventParticipants(eventId, { limit: 100 }, {
    query: { staleTime: 30_000 },
  });

  const participants = (data as unknown as { data: Array<Record<string, unknown>> })?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
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
    <div>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        <div className="flex items-center gap-2">
          <Users size={14} className="text-[var(--color-text-secondary)]" />
          <span className="text-xs font-bold text-[var(--color-text-secondary)]">
            {t('events.participantsList')}
          </span>
          <span className="rounded-full bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
            {participants.length}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-[var(--color-text-secondary)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Participant list */}
      {expanded && (
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
          {participants.map((p, i) => {
            const addr = String(p.address ?? '');
            const nickname = p.nickname as string | null;
            const isCurrentUser = address?.toLowerCase() === addr.toLowerCase();
            const staggerClass = i < 10 ? `stagger-${i + 1}` : '';

            return (
              <div
                key={addr}
                className={`animate-fade-up ${staggerClass} flex items-center justify-between rounded-lg px-3 py-2 ${
                  isCurrentUser ? 'bg-amber-500/8' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--color-text-secondary)] w-5 text-right shrink-0">
                    {i + 1}
                  </span>
                  <UserAvatar address={addr} size={24} />
                  <span className="text-xs font-medium">
                    {nickname ?? shortAddr(addr)}
                    {isCurrentUser && <span className="ml-1 text-amber-400">({t('leaderboard.you')})</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
