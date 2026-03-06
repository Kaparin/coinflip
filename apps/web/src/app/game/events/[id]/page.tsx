'use client';

import { use, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Trophy, Target, Users, Clock, CheckCircle, Calendar, User, Lock, XCircle, Pencil, Loader2, BarChart3, Info, Megaphone } from 'lucide-react';
import { useGetEventById, useGetEventResults } from '@coinflip/api-client';
import { formatLaunch } from '@coinflip/shared/constants';
import { AxmTokenIcon, LaunchTokenIcon } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { EventTimer } from '@/components/features/events/event-timer';
import { PrizeDisplay } from '@/components/features/events/prize-display';
import { ContestLeaderboard } from '@/components/features/events/contest-leaderboard';
import { RaffleParticipants } from '@/components/features/events/raffle-participants';
import { JoinRaffleButton } from '@/components/features/events/join-raffle-button';
import { getEventTheme } from '@/components/features/events/event-theme';
import { useTranslation, pickLocalized } from '@/lib/i18n';
import { useCancelSponsoredRaffle, useUpdateSponsoredRaffle } from '@/hooks/use-sponsored-raffle';

function formatDateRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  return `${fmt(startsAt)} \u2014 ${fmt(endsAt)}`;
}

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

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useTranslation();
  const { data, isLoading } = useGetEventById(id, {
    query: { staleTime: 30_000, refetchInterval: 60_000 },
  });

  const event = data?.data;

  const isContest = event?.type === 'contest';
  const hasResults = event?.status === 'completed' || event?.status === 'calculating' || event?.status === 'archived';

  // Owner controls
  const ev = event as unknown as Record<string, unknown> | undefined;
  const isOwner = Boolean(ev?.isOwner);
  const isSponsored = Boolean(ev?.sponsorAddress);
  const pricePaid = ev?.pricePaid ? String(ev.pricePaid) : null;

  const cancelMutation = useCancelSponsoredRaffle();
  const updateMutation = useUpdateSponsoredRaffle();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showEditDates, setShowEditDates] = useState(false);
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editDurationHours, setEditDurationHours] = useState(0);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const handleCancel = useCallback(async () => {
    if (!event) return;
    try {
      await cancelMutation.mutateAsync(event.id);
      setCancelSuccess(true);
      setShowCancelConfirm(false);
    } catch {
      // error shown by mutation state
    }
  }, [event, cancelMutation]);

  const handleUpdate = useCallback(async () => {
    if (!event || !editStartsAt) return;
    const startDate = new Date(editStartsAt);
    const endDate = new Date(startDate.getTime() + editDurationHours * 60 * 60 * 1000);
    try {
      await updateMutation.mutateAsync({
        eventId: event.id,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
      });
      setShowEditDates(false);
    } catch {
      // error shown by mutation state
    }
  }, [event, editStartsAt, editDurationHours, updateMutation]);

  // Fetch results for completed events (hook must be called unconditionally)
  const { data: resultsData } = useGetEventResults(id, {
    query: { staleTime: 60_000, enabled: !!hasResults && !isContest },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 lg:px-6 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-4xl px-4 lg:px-6 py-12 text-center space-y-3">
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.notFoundOrCanceled')}</p>
        <Link href="/game/events" className="inline-block text-sm text-[var(--color-primary)] hover:underline">
          {t('events.backToEvents')}
        </Link>
      </div>
    );
  }

  const theme = getEventTheme(event.type);
  const TypeIcon = isContest ? Target : Trophy;
  const now = new Date();
  const notStartedYet = new Date(event.startsAt) > now;
  const isUpcoming = (event.status === 'draft' || event.status === 'active') && notStartedYet;
  const isActive = (event.status === 'active') && !notStartedYet;
  const isEnded = event.status === 'completed' || event.status === 'calculating' || event.status === 'archived';
  const prizes = event.prizes as Array<{ place: number; amount: string; label?: string }>;
  const localTitle = pickLocalized(locale, event.title, ev?.titleEn as string | undefined, ev?.titleRu as string | undefined);
  const eventDescription = pickLocalized(locale, event.description ? String(event.description) : null, ev?.descriptionEn as string | undefined, ev?.descriptionRu as string | undefined) || null;

  // Extract winners + seed from results
  const resultsResponse = resultsData as unknown as { data?: { winners?: Array<Record<string, unknown>>; raffleSeed?: string } };
  const winners = resultsResponse?.data?.winners?.map(w => ({
    finalRank: Number(w.finalRank),
    address: String(w.address ?? ''),
    prizeAmount: String(w.prizeAmount ?? '0'),
    prizeTxHash: (w.prizeTxHash as string | null) ?? null,
    nickname: (w.nickname as string | null) ?? null,
    vip_tier: (w.vip_tier as string | null) ?? null,
    frameStyle: (w.frame_style as string | null) ?? null,
    nameGradient: (w.name_gradient as string | null) ?? null,
  }));
  const raffleSeed = resultsResponse?.data?.raffleSeed ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 lg:px-6 py-6 pb-24 md:pb-6 space-y-4 overflow-y-auto">
      {/* Back link */}
      <Link href="/game/events" className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
        <ArrowLeft size={14} />
        {t('events.backToEvents')}
      </Link>

      {/* Header card */}
      <div className={`relative overflow-hidden rounded-2xl border border-[var(--color-border)] ${
        isActive || isUpcoming ? `${theme.borderGlow}` : ''
      }`}>
        {/* Gradient background */}
        {isContest ? (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-[var(--color-surface)] to-violet-950/40" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950/60 via-[var(--color-surface)] to-yellow-950/40" />
        )}
        <div className={`absolute top-0 right-0 w-72 h-72 rounded-full blur-[100px] -translate-y-1/3 translate-x-1/4 ${
          isContest ? 'bg-indigo-500/8' : 'bg-amber-500/8'
        }`} />

        <div className="relative flex items-stretch gap-0">
          {/* Image section */}
          <div className="relative shrink-0 w-28 sm:w-36 self-center p-3">
            <Image
              src={isContest ? '/solo-tournament.png' : '/raffles-axm.png'}
              alt={isContest ? 'Contest' : 'Raffle'}
              width={144}
              height={144}
              className={`w-full h-auto object-contain ${
                isContest
                  ? 'drop-shadow-[0_0_20px_rgba(99,102,241,0.35)]'
                  : 'drop-shadow-[0_0_20px_rgba(245,158,11,0.35)]'
              }`}
              sizes="144px"
            />
          </div>

          {/* Content section */}
          <div className="flex-1 min-w-0 p-4 pl-1 space-y-2.5">
            {/* Top row: badges + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${theme.badgeBg} border ${isContest ? 'border-indigo-500/20' : 'border-amber-500/20'}`}>
                  <TypeIcon size={10} />
                  {isContest ? t('events.contest') : t('events.raffle')}
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
              </div>

              {/* Status badge */}
              {!isActive && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                  isUpcoming ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]' :
                  event.status === 'completed' ? `${theme.badgeBg}` :
                  event.status === 'calculating' ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]' :
                  'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)]'
                }`}>
                  {isUpcoming ? t('events.upcoming') : t(`events.status.${event.status}`)}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-lg font-bold">{localTitle}</h1>

            {/* Description */}
            {eventDescription && (
              <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2">{eventDescription}</p>
            )}

            {/* Sponsor line */}
            {(() => {
              const ev2 = event as unknown as Record<string, unknown>;
              const addr = ev2.sponsorAddress ? String(ev2.sponsorAddress) : null;
              if (!addr) return null;
              const nick = ev2.sponsorNickname ? String(ev2.sponsorNickname) : null;
              return (
                <div className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs text-violet-300">
                  <Megaphone size={12} className="text-violet-400 shrink-0" />
                  <span className="font-medium">
                    {t('sponsoredRaffle.sponsoredBy')}{' '}
                    <span className="font-bold text-violet-400">
                      {nick || `${addr.slice(0, 10)}...`}
                    </span>
                  </span>
                </div>
              );
            })()}

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <div className="flex items-center gap-1.5">
                <Trophy size={12} className={theme.iconColor} />
                <span className="font-bold text-[var(--color-success)]">{formatLaunch(event.totalPrizePool)}</span>
                {isSponsored ? <LaunchTokenIcon size={16} /> : <AxmTokenIcon size={16} />}
              </div>
              <div className="flex items-center gap-1">
                <Users size={12} />
                <span>{event.participantCount} {t('events.participants')}</span>
              </div>
              {isUpcoming && (
                <>
                  <div className="flex items-center gap-1">
                    <Clock size={12} className={theme.iconColor} />
                    <EventTimer targetDate={event.startsAt} compact eventType={event.type} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    <span>{formatDuration(event.startsAt, event.endsAt)}</span>
                  </div>
                </>
              )}
              {isActive && (
                <div className="flex items-center gap-1">
                  <Clock size={12} className={theme.iconColor} />
                  <span>{t('events.endsIn')}</span>
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

            {/* Participation badge */}
            {isEnded && event.hasJoined && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[var(--color-success)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-success)]">
                <CheckCircle size={14} />
                {t('events.youParticipated')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event rules — context-specific based on config */}
      {(isActive || isUpcoming) && (() => {
        const config = (event as unknown as Record<string, unknown>).config as {
          metric?: string; autoJoin?: boolean; minBetAmount?: string;
          minBets?: number; minTurnover?: string; maxParticipants?: number;
        } | undefined;

        const metricKeys: Record<string, string> = {
          turnover: 'events.rules.metricTurnover',
          wins: 'events.rules.metricWins',
          profit: 'events.rules.metricProfit',
        };

        return (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Info size={14} className={theme.iconColor} />
              {t('events.rules.title')}
            </div>

            <div className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
              {isContest ? (
                <>
                  <p>{t('events.rules.contestAutoJoin')}</p>
                  {config?.metric && (
                    <div className="flex items-center gap-1.5">
                      <BarChart3 size={12} className={theme.iconColor} />
                      <span>
                        {t('events.rules.contestRankedBy')}{' '}
                        <span className="font-bold text-[var(--color-text)]">
                          {t(metricKeys[config.metric] ?? 'events.metric')}
                        </span>
                      </span>
                    </div>
                  )}
                  {config?.minBetAmount && BigInt(config.minBetAmount) > 0n && (
                    <p>{t('events.rules.minBetAmount').replace('{{amount}}', formatLaunch(config.minBetAmount))}</p>
                  )}
                </>
              ) : (
                <>
                  <p>{t('events.rules.raffleJoinRequired')}</p>
                  {config?.minBets && (
                    <p>{t('events.rules.raffleRequiresMinBets').replace('{{count}}', String(config.minBets))}</p>
                  )}
                  {config?.minTurnover && BigInt(config.minTurnover) > 0n && (
                    <p>{t('events.rules.raffleRequiresMinTurnover').replace('{{amount}}', formatLaunch(config.minTurnover))}</p>
                  )}
                  {config?.maxParticipants && (
                    <p>
                      {event.participantCount >= config.maxParticipants
                        ? t('events.rules.raffleFull')
                        : t('events.rules.raffleMaxParticipants')
                            .replace('{{current}}', String(event.participantCount))
                            .replace('{{max}}', String(config.maxParticipants))}
                    </p>
                  )}
                </>
              )}
              <p className="text-[10px] mt-1">{t('events.rules.prizesCredited')}</p>
            </div>
          </div>
        );
      })()}

      {/* Owner controls for sponsored raffle */}
      {isOwner && !isEnded && !cancelSuccess && (() => {
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
        const canEdit = isUpcoming && new Date(event.startsAt) > oneHourFromNow;

        return (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <User size={14} />
              {t('sponsoredRaffle.yourRaffle')}
            </div>

            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditStartsAt(event.startsAt.slice(0, 16));
                    const dur = (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / (1000 * 60 * 60);
                    setEditDurationHours(Math.round(dur));
                    setShowEditDates(!showEditDates);
                    setShowCancelConfirm(false);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <Pencil size={12} />
                  {t('sponsoredRaffle.editDates')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCancelConfirm(!showCancelConfirm); setShowEditDates(false); }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <XCircle size={12} />
                  {t('sponsoredRaffle.cancel')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                <Lock size={12} />
                {t('sponsoredRaffle.lockedDesc')}
              </div>
            )}

            {/* Cancel confirmation */}
            {showCancelConfirm && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 space-y-2">
                <p className="text-xs text-red-300">
                  {pricePaid
                    ? t('sponsoredRaffle.cancelConfirm').replace('{{amount}}', formatLaunch(pricePaid))
                    : t('sponsoredRaffle.cancel') + '?'}
                </p>
                {cancelMutation.error && (
                  <p className="text-xs text-red-400">{cancelMutation.error.message}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                    className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    {cancelMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('sponsoredRaffle.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(false)}
                    className="rounded-lg border border-[var(--color-border)] px-4 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            )}

            {/* Edit dates form */}
            {showEditDates && (
              <div className="rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] p-3 space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1 block">
                    {t('sponsoredRaffle.fieldStartTime')}
                  </label>
                  <input
                    type="datetime-local"
                    value={editStartsAt}
                    onChange={(e) => setEditStartsAt(e.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1 block">
                    {t('sponsoredRaffle.fieldDuration')}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 6, 12, 24, 48, 72, 168].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setEditDurationHours(h)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          editDurationHours === h
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/30'
                        }`}
                      >
                        {h >= 24 ? `${h / 24}d` : `${h}h`}
                      </button>
                    ))}
                  </div>
                </div>
                {updateMutation.error && (
                  <p className="text-xs text-red-400">{updateMutation.error.message}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={updateMutation.isPending || !editStartsAt}
                    className="rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-bold text-white hover:bg-[var(--color-primary)]/80 disabled:opacity-50 transition-colors"
                  >
                    {updateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditDates(false)}
                    className="rounded-lg border border-[var(--color-border)] px-4 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Cancel success */}
      {cancelSuccess && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center space-y-2">
          <CheckCircle size={28} className="mx-auto text-[var(--color-success)]" />
          <h3 className="text-sm font-bold">{t('sponsoredRaffle.canceled')}</h3>
          <p className="text-xs text-[var(--color-text-secondary)]">{t('sponsoredRaffle.canceledDesc')}</p>
          <Link href="/game/events" className="inline-block text-xs text-[var(--color-primary)] hover:underline mt-2">
            {t('events.backToEvents')}
          </Link>
        </div>
      )}

      {/* Unified Prizes + Winners */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {hasResults && winners && winners.length > 0 ? t('events.resultsTitle') : t('events.prizes')}
        </h2>
        <PrizeDisplay
          prizes={prizes}
          winners={hasResults ? winners : undefined}
          eventType={event.type}
          raffleSeed={hasResults ? raffleSeed : null}
          raffleSeedLabel={t('events.raffleSeed')}
          isSponsored={isSponsored}
        />
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

      {/* Leaderboard (contests) */}
      {isContest && (isActive || isEnded) && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('events.leaderboard')}
          </h2>
          <ContestLeaderboard eventId={event.id} />
        </section>
      )}

      {/* Participants (raffles) — collapsible */}
      {!isContest && (isActive || isUpcoming || isEnded) && (
        <section>
          <RaffleParticipants eventId={event.id} />
        </section>
      )}
    </div>
  );
}
