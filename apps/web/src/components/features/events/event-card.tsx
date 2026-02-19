'use client';

import Link from 'next/link';
import { Trophy, Users, Target } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { EventTimer } from './event-timer';
import { useTranslation } from '@/lib/i18n';

interface EventCardProps {
  event: {
    id: string;
    type: string;
    title: string;
    description?: string | null;
    status: string;
    startsAt: string;
    endsAt: string;
    totalPrizePool: string;
    participantCount: number;
    hasJoined?: boolean;
  };
  size?: 'large' | 'medium' | 'compact';
}

export function EventCard({ event, size = 'medium' }: EventCardProps) {
  const { t } = useTranslation();
  const isActive = event.status === 'active';
  const isCompleted = event.status === 'completed' || event.status === 'calculating';
  const isUpcoming = event.status === 'draft' && new Date(event.startsAt) > new Date();

  const typeIcon = event.type === 'contest'
    ? <Target size={14} className="text-[var(--color-primary)]" />
    : <Trophy size={14} className="text-[var(--color-warning)]" />;

  const typeBadge = event.type === 'contest'
    ? t('events.contest')
    : t('events.raffle');

  if (size === 'compact') {
    return (
      <Link
        href={`/game/events/${event.id}`}
        className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        <div className="flex items-center gap-2 min-w-0">
          {typeIcon}
          <span className="text-sm font-medium truncate">{event.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-[var(--color-success)]">{formatLaunch(event.totalPrizePool)}</span>
          <LaunchTokenIcon size={32} />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/game/events/${event.id}`}
      className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:bg-[var(--color-surface-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Type badge */}
          <div className="flex items-center gap-1.5 mb-1.5">
            {typeIcon}
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
              {typeBadge}
            </span>
            {event.hasJoined && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-success)]">
                {t('events.joined')}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className={`font-bold truncate ${size === 'large' ? 'text-lg' : 'text-sm'}`}>
            {event.title}
          </h3>

          {/* Description */}
          {size === 'large' && event.description && (
            <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-2">
              {event.description}
            </p>
          )}
        </div>

        {/* Timer */}
        <div className="shrink-0">
          {isActive && <EventTimer targetDate={event.endsAt} label={t('events.endsIn')} />}
          {isUpcoming && <EventTimer targetDate={event.startsAt} label={t('events.startsIn')} />}
          {isCompleted && (
            <span className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">
              {t('events.ended')}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-1">
            <Users size={12} />
            <span>{event.participantCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Trophy size={12} className="text-[var(--color-warning)]" />
          <span className="text-sm font-bold text-[var(--color-success)]">{formatLaunch(event.totalPrizePool)}</span>
          <LaunchTokenIcon size={36} />
        </div>
      </div>
    </Link>
  );
}
