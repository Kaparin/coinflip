'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Target, X, Clock, Zap, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { formatLaunch } from '@coinflip/shared/constants';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';

interface EventStartModalProps {
  open: boolean;
  onDismiss: () => void;
  eventId: string;
  eventType: string; // 'contest' | 'raffle'
  title: string;
  description?: string | null;
  totalPrizePool: string;
  endsAt: string;
  sponsorAddress?: string;
  sponsorNickname?: string;
}

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function formatTimeRemaining(endsAt: string): string | null {
  if (!endsAt) return null;
  const endsDate = new Date(endsAt);
  if (isNaN(endsDate.getTime())) return null;
  const diffMs = endsDate.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  const remainingMins = totalMinutes % 60;
  if (days > 0) return `${days}d ${remainingHours}h`;
  if (hours > 0) return `${hours}h ${remainingMins}m`;
  return `${remainingMins}m`;
}

export function EventStartModal({
  open,
  onDismiss,
  eventId,
  eventType,
  title,
  description,
  totalPrizePool,
  endsAt,
  sponsorAddress,
  sponsorNickname,
}: EventStartModalProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = 'hidden';
      return () => { cancelAnimationFrame(id); document.body.style.overflow = ''; };
    }
    setVisible(false);
    document.body.style.overflow = '';
  }, [open]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  const handleViewEvent = useCallback(() => {
    handleDismiss();
    setTimeout(() => router.push(`/game/events/${eventId}`), 250);
  }, [handleDismiss, router, eventId]);

  if (!mounted || !open) return null;

  const isContest = eventType === 'contest';
  const Icon = isContest ? Target : Trophy;
  const isSponsored = !!sponsorAddress;
  const timeStr = formatTimeRemaining(endsAt);

  // Theme
  const accentFrom = isContest ? 'from-indigo-500' : 'from-amber-500';
  const accentTo = isContest ? 'to-violet-600' : 'to-orange-500';
  const accentColor = isContest ? 'text-indigo-400' : 'text-amber-400';
  const accentBg = isContest ? 'bg-indigo-500' : 'bg-amber-500';
  const borderColor = isContest ? 'border-indigo-500/25' : 'border-amber-500/25';
  const glowShadow = isContest ? 'shadow-indigo-500/15' : 'shadow-amber-500/15';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={handleDismiss}
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border bg-[var(--color-surface)] shadow-2xl ${glowShadow} transition-all duration-300 overflow-hidden ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } ${borderColor}`}
      >
        {/* Gradient header strip */}
        <div className={`h-1.5 w-full bg-gradient-to-r ${accentFrom} ${accentTo}`} />

        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-bg)]/80 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
        >
          <X size={14} />
        </button>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-5 space-y-4">
            {/* Icon + badge row */}
            <div className="flex flex-col items-center gap-2.5">
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${accentBg}/15`}>
                <Icon size={32} className={accentColor} />
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${accentBg}/15 ${accentColor}`}>
                <Zap size={10} />
                {isContest ? t('events.contest') : t('events.raffle')}
              </span>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-center leading-tight">{title}</h3>

            {/* Description */}
            {description && (
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
                {description}
              </p>
            )}

            {/* Stats row */}
            <div className="flex items-stretch gap-2">
              {/* Prize pool */}
              <div className={`flex-1 rounded-xl border ${borderColor} bg-[var(--color-bg)] p-3 text-center`}>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
                  {t('events.eventStartModal.prize')}
                </p>
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-lg font-bold text-[var(--color-success)]">{formatLaunch(totalPrizePool)}</span>
                  <LaunchTokenIcon size={20} />
                </div>
              </div>

              {/* Time remaining */}
              {timeStr && (
                <div className={`flex-1 rounded-xl border ${borderColor} bg-[var(--color-bg)] p-3 text-center`}>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
                    {t('events.eventStartModal.remaining')}
                  </p>
                  <div className="flex items-center justify-center gap-1.5">
                    <Clock size={16} className={accentColor} />
                    <span className="text-lg font-bold">{timeStr}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sponsor badge */}
            {isSponsored && (
              <Link
                href={`/game/profile/${sponsorAddress}`}
                onClick={handleDismiss}
                className="flex items-center gap-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] px-3.5 py-2.5 transition-colors hover:border-amber-500/30 group"
              >
                <UserAvatar address={sponsorAddress} size={24} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate group-hover:text-amber-300 transition-colors">
                    {sponsorNickname || shortAddr(sponsorAddress)}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    {t('announcement.sponsor')}
                  </p>
                </div>
                <ChevronRight size={14} className="text-[var(--color-text-secondary)] shrink-0" />
              </Link>
            )}
          </div>

          {/* Sticky buttons */}
          <div className="sticky bottom-0 px-5 pb-5 pt-2 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)] to-transparent space-y-2">
            <button
              type="button"
              onClick={handleViewEvent}
              className={`w-full rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${accentFrom} ${accentTo} shadow-lg ${glowShadow}`}
            >
              {t('events.eventStartModal.viewEvent')}
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              {t('events.eventStartModal.dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
