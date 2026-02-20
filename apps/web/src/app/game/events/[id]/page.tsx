'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Target, Users, Clock, CheckCircle, Calendar } from 'lucide-react';
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
import { getEventTheme } from '@/components/features/events/event-theme';
import { useTranslation } from '@/lib/i18n';

function formatDateRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  return `${fmt(startsAt)} \u2014 ${fmt(endsAt)}`;
}

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
      <div className="mx-auto max-w-2xl px-4 py-12 text-center space-y-3">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.notFoundOrCanceled')}</p>
        <Link href="/game/events" className="inline-block text-sm text-[var(--color-primary)] hover:underline">
          {t('events.backToEvents')}
        </Link>
      </div>
    );
  }

  const isContest = event.type === 'contest';
  const theme = getEventTheme(event.type);
  const TypeIcon = isContest ? Target : Trophy;
  const isActive = event.status === 'active';
  const isUpcoming = event.status === 'draft' && new Date(event.startsAt) > new Date();
  const isEnded = event.status === 'completed' || event.status === 'calculating' || event.status === 'archived';
  const hasResults = event.status === 'completed' || event.status === 'calculating' || event.status === 'archived';
  const prizes = event.prizes as Array<{ place: number; amount: string; label?: string }>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      {/* Back link */}
      <Link href="/game/events" className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
        <ArrowLeft size={14} />
        {t('events.backToEvents')}
      </Link>

      {/* Header card */}
      <div className={`relative overflow-hidden rounded-xl border border-[var(--color-border)] p-4 space-y-3 ${
        isActive || isUpcoming ? `${theme.bgGradient} ${theme.borderGlow}` : 'bg-[var(--color-surface)]'
      }`}>
        {/* Decorative icon */}
        <TypeIcon
          size={100}
          className={`absolute -top-3 -right-3 opacity-[0.04] ${theme.iconColor}`}
          strokeWidth={1}
        />

        <div className="relative flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <TypeIcon size={14} className={theme.iconColor} />
              <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${theme.badgeBg}`}>
                {isContest ? t('events.contest') : t('events.raffle')}
              </span>
            </div>
            <h1 className="text-lg font-bold">{event.title}</h1>
          </div>

          {/* Status badge */}
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
            isActive ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' :
            isUpcoming ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]' :
            event.status === 'completed' ? `${theme.badgeBg}` :
            event.status === 'calculating' ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]' :
            'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)]'
          }`}>
            {isUpcoming ? t('events.upcoming') : event.status}
          </span>
        </div>

        {event.description && (
          <p className="relative text-xs text-[var(--color-text-secondary)]">{event.description}</p>
        )}

        {/* Stats row */}
        <div className="relative flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-1.5">
            <Trophy size={12} className={theme.iconColor} />
            <span className="font-bold text-[var(--color-success)]">{formatLaunch(event.totalPrizePool)}</span>
            <LaunchTokenIcon size={32} />
          </div>
          <div className="flex items-center gap-1">
            <Users size={12} className={theme.iconColor} />
            <span>{event.participantCount} {t('events.participants')}</span>
          </div>
          {isUpcoming && (
            <div className="flex items-center gap-1">
              <Clock size={12} className={theme.iconColor} />
              <span className="text-[var(--color-text-secondary)]">{t('events.startsIn')}</span>
              <EventTimer targetDate={event.startsAt} compact eventType={event.type} />
            </div>
          )}
          {isActive && (
            <div className="flex items-center gap-1">
              <Clock size={12} className={theme.iconColor} />
              <EventTimer targetDate={event.endsAt} compact eventType={event.type} />
            </div>
          )}
          {isEnded && (
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>{formatDateRange(event.startsAt, event.endsAt)}</span>
            </div>
          )}
        </div>

        {/* Participation badge for ended events */}
        {isEnded && event.hasJoined && (
          <div className="relative flex items-center gap-1.5 rounded-lg bg-[var(--color-success)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-success)]">
            <CheckCircle size={14} />
            {t('events.youParticipated')}
          </div>
        )}
      </div>

      {/* Prizes */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t('events.prizes')}
        </h2>
        <PrizeDisplay prizes={prizes} eventType={event.type} />
      </section>

      {/* Join button (raffle, active or upcoming) */}
      {!isContest && (isActive || isUpcoming) && (
        <JoinRaffleButton
          eventId={event.id}
          hasJoined={event.hasJoined}
          eventType={event.type}
          eventStatus={event.status}
        />
      )}

      {/* Results (ended events with results) */}
      {hasResults && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('events.resultsTitle')}
          </h2>
          <EventResults eventId={event.id} eventType={event.type} />
        </section>
      )}

      {/* Leaderboard (contests) */}
      {isContest && (isActive || isEnded) && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('events.leaderboard')}
          </h2>
          <ContestLeaderboard eventId={event.id} />
        </section>
      )}

      {/* Participants (raffles) */}
      {!isContest && (isActive || isUpcoming || isEnded) && (
        <section>
          <RaffleParticipants eventId={event.id} />
        </section>
      )}
    </div>
  );
}
