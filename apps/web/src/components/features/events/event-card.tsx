'use client';

import Link from 'next/link';
import { Trophy, Users, Target, User, Eye, Lock } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { EventTimer } from './event-timer';
import { getEventTheme } from './event-theme';
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
    sponsorAddress?: string | null;
    sponsorNickname?: string | null;
    isOwner?: boolean;
  };
  size?: 'large' | 'medium' | 'compact';
  index?: number;
}

export function EventCard({ event, size = 'medium', index = 0 }: EventCardProps) {
  const { t } = useTranslation();
  const theme = getEventTheme(event.type);
  const isActive = event.status === 'active';
  const isCompleted = event.status === 'completed' || event.status === 'calculating';
  const isUpcoming = event.status === 'draft' && new Date(event.startsAt) > new Date();

  const TypeIcon = event.type === 'contest' ? Target : Trophy;

  const typeBadge = event.type === 'contest'
    ? t('events.contest')
    : t('events.raffle');

  const staggerClass = index < 10 ? `stagger-${index + 1}` : '';

  if (size === 'compact') {
    const borderColor = event.type === 'contest'
      ? 'border-l-indigo-500/40'
      : 'border-l-amber-500/40';

    return (
      <Link
        href={`/game/events/${event.id}`}
        className={`animate-fade-up ${staggerClass} flex items-center justify-between rounded-xl border border-[var(--color-border)] border-l-2 ${borderColor} bg-[var(--color-surface)] px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-hover)] ${isCompleted ? 'opacity-80' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon size={14} className={theme.iconColor} />
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
      className={`animate-fade-up ${staggerClass} relative block overflow-hidden rounded-xl border border-[var(--color-border)] p-4 card-hover ${
        isActive || isUpcoming
          ? `${theme.bgGradient} ${theme.borderGlow} shimmer-overlay`
          : 'bg-[var(--color-surface)]'
      } ${isCompleted ? 'opacity-80' : ''}`}
    >
      {/* Decorative large icon (large size only) */}
      {size === 'large' && (
        <TypeIcon
          size={80}
          className={`absolute -top-2 -right-2 opacity-[0.04] ${theme.iconColor}`}
          strokeWidth={1}
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Type badge */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <TypeIcon size={14} className={theme.iconColor} />
            <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${theme.badgeBg}`}>
              {typeBadge}
            </span>
            {event.hasJoined && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-success)]">
                {t('events.joined')}
              </span>
            )}
            {event.isOwner && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                <User size={9} />
                {t('sponsoredRaffle.yourRaffle')}
              </span>
            )}
            {event.isOwner && isUpcoming && new Date(event.startsAt) > new Date(Date.now() + 60 * 60 * 1000) && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                <Eye size={9} />
                {t('sponsoredRaffle.onlyYouSee')}
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
          {isActive && <EventTimer targetDate={event.endsAt} label={t('events.endsIn')} eventType={event.type} />}
          {isUpcoming && <EventTimer targetDate={event.startsAt} label={t('events.startsIn')} eventType={event.type} />}
          {isCompleted && (
            <span className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">
              {t('events.ended')}
            </span>
          )}
        </div>
      </div>

      {/* Sponsor badge */}
      {event.sponsorAddress && (
        <div className="relative flex items-center gap-1 mt-1 text-[10px] text-amber-400">
          <User size={10} />
          <span>{t('sponsoredRaffle.sponsoredBy')} {event.sponsorNickname || `${event.sponsorAddress.slice(0, 8)}...`}</span>
        </div>
      )}

      {/* Footer */}
      <div className="relative mt-3 flex items-center justify-between">
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
