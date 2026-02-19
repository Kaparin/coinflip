'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Target, Users, Clock } from 'lucide-react';
import { useGetEventById } from '@coinflip/api-client';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { EventTimer } from '@/components/features/events/event-timer';
import { PrizeDisplay } from '@/components/features/events/prize-display';
import { ContestLeaderboard } from '@/components/features/events/contest-leaderboard';
import { RaffleParticipants } from '@/components/features/events/raffle-participants';
import { EventResults } from '@/components/features/events/event-results';
import { JoinRaffleButton } from '@/components/features/events/join-raffle-button';
import { useTranslation } from '@/lib/i18n';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const { data, isLoading } = useGetEventById(id, {
    query: { staleTime: 30_000, refetchInterval: 60_000 },
  });

  const event = data?.data;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.notFound')}</p>
        <Link href="/game/events" className="mt-4 inline-block text-sm text-[var(--color-primary)] hover:underline">
          {t('common.back')}
        </Link>
      </div>
    );
  }

  const isContest = event.type === 'contest';
  const isActive = event.status === 'active';
  const isCompleted = event.status === 'completed' || event.status === 'calculating';
  const prizes = event.prizes as Array<{ place: number; amount: string; label?: string }>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      {/* Back link */}
      <Link href="/game/events" className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
        <ArrowLeft size={14} />
        {t('events.backToEvents')}
      </Link>

      {/* Header card */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {isContest ? (
                <Target size={14} className="text-[var(--color-primary)]" />
              ) : (
                <Trophy size={14} className="text-[var(--color-warning)]" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {isContest ? t('events.contest') : t('events.raffle')}
              </span>
            </div>
            <h1 className="text-lg font-bold">{event.title}</h1>
          </div>

          {/* Status badge */}
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
            isActive ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' :
            isCompleted ? 'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)]' :
            'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
          }`}>
            {event.status}
          </span>
        </div>

        {event.description && (
          <p className="text-xs text-[var(--color-text-secondary)]">{event.description}</p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-1.5">
            <Trophy size={12} className="text-[var(--color-warning)]" />
            <span className="font-bold text-[var(--color-success)]">{formatLaunch(event.totalPrizePool)}</span>
            <LaunchTokenIcon size={32} />
          </div>
          <div className="flex items-center gap-1">
            <Users size={12} />
            <span>{event.participantCount} {t('events.participants')}</span>
          </div>
          {isActive && (
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <EventTimer targetDate={event.endsAt} compact />
            </div>
          )}
        </div>
      </div>

      {/* Prizes */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t('events.prizes')}
        </h2>
        <PrizeDisplay prizes={prizes} />
      </section>

      {/* Join button (raffle or opt-in contest) */}
      {!isContest && isActive && (
        <JoinRaffleButton
          eventId={event.id}
          hasJoined={event.hasJoined}
          eventType={event.type}
          eventStatus={event.status}
        />
      )}

      {/* Leaderboard (contests) */}
      {isContest && (isActive || isCompleted) && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('events.leaderboard')}
          </h2>
          <ContestLeaderboard eventId={event.id} />
        </section>
      )}

      {/* Participants (raffles) */}
      {!isContest && (isActive || isCompleted) && (
        <section>
          <RaffleParticipants eventId={event.id} />
        </section>
      )}

      {/* Results (completed) */}
      {isCompleted && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('events.resultsTitle')}
          </h2>
          <EventResults eventId={event.id} />
        </section>
      )}
    </div>
  );
}
