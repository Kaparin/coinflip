'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Target, X, User } from 'lucide-react';
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

  // Theme colors based on event type
  const borderColor = isContest ? 'border-indigo-500/30' : 'border-amber-500/30';
  const iconBg = isContest ? 'bg-indigo-500/15' : 'bg-amber-500/15';
  const iconColor = isContest ? 'text-indigo-400' : 'text-amber-400';
  const btnGradient = isContest
    ? 'from-indigo-500 to-indigo-600 shadow-indigo-500/20'
    : 'from-amber-500 to-amber-600 shadow-amber-500/20';
  const badgeBg = isContest
    ? 'bg-indigo-500/15 text-indigo-400'
    : 'bg-amber-500/15 text-amber-400';

  // Time remaining
  const endsDate = new Date(endsAt);
  const diffMs = endsDate.getTime() - Date.now();
  const diffHours = Math.max(0, Math.floor(diffMs / 3_600_000));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  const timeStr = diffDays > 0
    ? `${diffDays}d ${remainingHours}h`
    : `${diffHours}h`;

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
        className={`w-full max-w-sm rounded-2xl border bg-[var(--color-surface)] shadow-2xl transition-all duration-300 ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } ${borderColor}`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
        >
          <X size={16} />
        </button>

        <div className="p-5 text-center space-y-3">
          {/* Sponsor badge */}
          {isSponsored && (
            <Link
              href={`/game/profile/${sponsorAddress}`}
              onClick={handleDismiss}
              className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 transition-colors hover:bg-amber-500/15 group"
            >
              <UserAvatar address={sponsorAddress} size={20} />
              <span className="text-xs font-medium text-amber-400 group-hover:text-amber-300 truncate">
                {sponsorNickname || shortAddr(sponsorAddress)}
              </span>
              <span className="text-[9px] text-[var(--color-text-secondary)] shrink-0">
                {t('announcement.sponsor')}
              </span>
            </Link>
          )}

          {/* Icon */}
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${iconBg}`}>
            <Icon size={28} className={iconColor} />
          </div>

          {/* Type badge */}
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeBg}`}>
            {isContest ? t('events.contest') : t('events.raffle')}
          </span>

          {/* Title */}
          <h3 className="text-lg font-bold">{title}</h3>

          {/* Description */}
          {description && (
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed line-clamp-3">
              {description}
            </p>
          )}

          {/* Prize pool + duration */}
          <div className="flex items-center justify-center gap-4 py-1">
            <div className="flex items-center gap-1.5">
              <Trophy size={14} className="text-[var(--color-warning)]" />
              <span className="text-sm font-bold text-[var(--color-success)]">{formatLaunch(totalPrizePool)}</span>
              <LaunchTokenIcon size={28} />
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              {timeStr} {t('events.eventStartModal.remaining')}
            </div>
          </div>

          {/* View Event button */}
          <button
            type="button"
            onClick={handleViewEvent}
            className={`w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${btnGradient} shadow-lg`}
          >
            {t('events.eventStartModal.viewEvent')}
          </button>

          {/* Dismiss link */}
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            {t('events.eventStartModal.dismiss')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
