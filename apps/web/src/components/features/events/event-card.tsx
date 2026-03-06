'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Trophy, Users, Target, User, Eye, Clock, BarChart3, Megaphone } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import { AxmTokenIcon, LaunchTokenIcon } from '@/components/ui';
import { EventTimer } from './event-timer';
import { getEventTheme } from './event-theme';
import { useTranslation, pickLocalized } from '@/lib/i18n';

function formatDuration(startsAt: string, endsAt: string): string {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (ms <= 0) return '';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainH = hours % 24;
  if (days > 0 && remainH > 0) return `${days}d ${remainH}h`;
  if (days > 0) return `${days}d`;
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  return `${minutes}m`;
}

const METRIC_KEYS: Record<string, string> = {
  turnover: 'events.rules.metricTurnover',
  wins: 'events.rules.metricWins',
  profit: 'events.rules.metricProfit',
};

interface EventConfig {
  metric?: string;
  autoJoin?: boolean;
  minBetAmount?: string;
  minBets?: number;
  minTurnover?: string;
  maxParticipants?: number;
}

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
    config?: EventConfig;
    titleEn?: string | null;
    titleRu?: string | null;
    descriptionEn?: string | null;
    descriptionRu?: string | null;
  };
  size?: 'large' | 'medium' | 'compact';
  index?: number;
}

export function EventCard({ event, size = 'medium', index = 0 }: EventCardProps) {
  const { t, locale } = useTranslation();
  const theme = getEventTheme(event.type);
  const localTitle = pickLocalized(locale, event.title, event.titleEn, event.titleRu);
  const localDescription = pickLocalized(locale, event.description, event.descriptionEn, event.descriptionRu);
  const now = new Date();
  const notStartedYet = new Date(event.startsAt) > now;
  const isUpcoming = (event.status === 'draft' || event.status === 'active') && notStartedYet;
  const isActive = (event.status === 'active') && !notStartedYet;
  const isCompleted = event.status === 'completed' || event.status === 'calculating';
  const isLive = isActive || isUpcoming;

  const isSponsored = !!event.sponsorAddress;
  const PrizeIcon = isSponsored ? LaunchTokenIcon : AxmTokenIcon;
  const isContest = event.type === 'contest';
  const TypeIcon = isContest ? Target : Trophy;

  const typeBadge = isContest
    ? t('events.contest')
    : t('events.raffle');

  const staggerClass = index < 10 ? `stagger-${index + 1}` : '';

  // Compact size — minimal row
  if (size === 'compact') {
    const borderColor = isContest
      ? 'border-l-indigo-500/40'
      : 'border-l-amber-500/40';

    return (
      <Link
        href={`/game/events/${event.id}`}
        className={`animate-fade-up ${staggerClass} flex items-center justify-between rounded-xl border border-[var(--color-border)] border-l-2 ${borderColor} bg-[var(--color-surface)] px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-hover)] ${isCompleted ? 'opacity-80' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isContest ? (
            <Image src="/solo-tournament.png" alt="" width={24} height={24} className="w-6 h-6 object-contain shrink-0" />
          ) : (
            <Image src="/raffles-axm.png" alt="" width={24} height={24} className="w-6 h-6 object-contain shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{localTitle}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-[var(--color-success)]">{formatLaunch(event.totalPrizePool)}</span>
          <PrizeIcon size={16} />
        </div>
      </Link>
    );
  }

  // Contest — special card with large image
  if (isContest && (size === 'large' || size === 'medium')) {
    return (
      <Link
        href={`/game/events/${event.id}`}
        className={`animate-fade-up ${staggerClass} relative block overflow-hidden rounded-2xl border card-hover ${
          isLive
            ? 'border-indigo-500/30 shimmer-overlay'
            : 'border-[var(--color-border)]'
        } ${isCompleted ? 'opacity-80' : ''}`}
      >
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-[var(--color-surface)] to-violet-950/40" />
        <div className="absolute top-0 right-0 w-60 h-60 bg-indigo-500/8 rounded-full blur-[80px] -translate-y-1/3 translate-x-1/4" />

        <div className="relative flex items-stretch gap-0">
          {/* Image section */}
          <div className="relative shrink-0 w-36 sm:w-44 md:w-52 self-center p-3">
            <Image
              src="/solo-tournament.png"
              alt="Solo Tournament"
              width={208}
              height={208}
              className="w-full h-auto object-contain drop-shadow-[0_0_20px_rgba(99,102,241,0.35)]"
              sizes="208px"
            />
          </div>

          {/* Content section */}
          <div className="flex-1 min-w-0 p-4 pl-0">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                <Target size={10} />
                {typeBadge}
              </span>
              {isActive && (
                <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
              {event.hasJoined && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-success)]">
                  {t('events.joined')}
                </span>
              )}
              {event.isOwner && (
                <span className="inline-flex items-center gap-0.5 rounded-lg bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400 border border-amber-500/20">
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
              {localTitle}
            </h3>

            {/* Contest metric */}
            {event.config?.metric && (
              <div className="flex items-center gap-1 mt-1">
                <BarChart3 size={10} className="text-[var(--color-text-secondary)]" />
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  {t(METRIC_KEYS[event.config.metric] ?? 'events.metric')}
                </span>
              </div>
            )}

            {/* Description */}
            {size === 'large' && localDescription && (
              <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-2">
                {localDescription}
              </p>
            )}

            {/* Sponsor */}
            {event.sponsorAddress && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-400">
                <User size={10} />
                <span>{t('sponsoredRaffle.sponsoredBy')} {event.sponsorNickname || `${event.sponsorAddress.slice(0, 8)}...`}</span>
              </div>
            )}

            {/* Footer: timer + prize + participants */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                <div className="flex items-center gap-1">
                  <Users size={12} />
                  <span>
                    {event.config?.maxParticipants
                      ? `${event.participantCount} / ${event.config.maxParticipants}`
                      : event.participantCount}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Timer */}
                {isActive && <EventTimer targetDate={event.endsAt} label={t('events.endsIn')} eventType={event.type} />}
                {isUpcoming && (
                  <div className="text-right">
                    <EventTimer targetDate={event.startsAt} label={t('events.startsIn')} eventType={event.type} />
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <Clock size={9} className="text-[var(--color-text-secondary)]" />
                      <span className="text-[9px] text-[var(--color-text-secondary)]">
                        {t('events.duration')}: {formatDuration(event.startsAt, event.endsAt)}
                      </span>
                    </div>
                  </div>
                )}
                {isCompleted && (
                  <span className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">
                    {t('events.ended')}
                  </span>
                )}

                {/* Prize */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Trophy size={12} className="text-[var(--color-warning)]" />
                  <span className="text-sm font-bold text-[var(--color-success)]">{formatLaunch(event.totalPrizePool)}</span>
                  <PrizeIcon size={16} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Raffle card — image-based design matching contest style
  return (
    <Link
      href={`/game/events/${event.id}`}
      className={`animate-fade-up ${staggerClass} relative block overflow-hidden rounded-2xl border card-hover ${
        isLive
          ? 'border-amber-500/30 shimmer-overlay'
          : 'border-[var(--color-border)]'
      } ${isCompleted ? 'opacity-80' : ''}`}
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-950/60 via-[var(--color-surface)] to-yellow-950/40" />
      <div className="absolute top-0 right-0 w-60 h-60 bg-amber-500/8 rounded-full blur-[80px] -translate-y-1/3 translate-x-1/4" />

      <div className="relative flex items-stretch gap-0">
        {/* Image section */}
        <div className="relative shrink-0 w-36 sm:w-44 md:w-52 self-center p-3">
          <Image
            src="/raffles-axm.png"
            alt="Raffle"
            width={208}
            height={208}
            className="w-full h-auto object-contain drop-shadow-[0_0_20px_rgba(245,158,11,0.35)]"
            sizes="208px"
          />
        </div>

        {/* Content section */}
        <div className="flex-1 min-w-0 p-4 pl-0">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/20">
              <Trophy size={10} />
              {typeBadge}
            </span>
            {isSponsored && (
              <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-violet-500/15 text-violet-400 border border-violet-500/20">
                <Megaphone size={10} />
                {t('events.sponsored')}
              </span>
            )}
            {isActive && (
              <span className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
            {event.hasJoined && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-success)]">
                {t('events.joined')}
              </span>
            )}
            {event.isOwner && (
              <span className="inline-flex items-center gap-0.5 rounded-lg bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400 border border-amber-500/20">
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
            {localTitle}
          </h3>

          {/* Description (large) or sponsor line */}
          {size === 'large' && localDescription && (
            <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-2">
              {localDescription}
            </p>
          )}

          {/* Sponsor line */}
          {isSponsored && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-400">
              <User size={10} />
              <span>{t('sponsoredRaffle.sponsoredBy')} {event.sponsorNickname || `${event.sponsorAddress!.slice(0, 8)}...`}</span>
            </div>
          )}

          {/* Footer: timer + prize + participants */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <div className="flex items-center gap-1">
                <Users size={12} />
                <span>
                  {event.config?.maxParticipants
                    ? `${event.participantCount} / ${event.config.maxParticipants}`
                    : event.participantCount}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Timer */}
              {isActive && <EventTimer targetDate={event.endsAt} label={t('events.endsIn')} eventType={event.type} />}
              {isUpcoming && (
                <div className="text-right">
                  <EventTimer targetDate={event.startsAt} label={t('events.startsIn')} eventType={event.type} />
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <Clock size={9} className="text-[var(--color-text-secondary)]" />
                    <span className="text-[9px] text-[var(--color-text-secondary)]">
                      {t('events.duration')}: {formatDuration(event.startsAt, event.endsAt)}
                    </span>
                  </div>
                </div>
              )}
              {isCompleted && (
                <span className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">
                  {t('events.ended')}
                </span>
              )}

              {/* Prize */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Trophy size={12} className="text-[var(--color-warning)]" />
                <span className="text-sm font-bold text-[var(--color-success)]">{formatLaunch(event.totalPrizePool)}</span>
                <PrizeIcon size={16} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
