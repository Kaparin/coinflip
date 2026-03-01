'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, AlertTriangle, X, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { UserAvatar } from '@/components/ui';
import Link from 'next/link';

interface AnnouncementModalProps {
  open: boolean;
  onDismiss: () => void;
  title: string;
  message: string;
  priority: 'normal' | 'important' | 'sponsored';
  sponsorAddress?: string;
  sponsorNickname?: string;
}

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export function AnnouncementModal({ open, onDismiss, title, message, priority, sponsorAddress, sponsorNickname }: AnnouncementModalProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();

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

  if (!mounted || !open) return null;

  const isImportant = priority === 'important';
  const isSponsored = !!sponsorAddress || priority === 'sponsored';
  const Icon = isImportant ? AlertTriangle : Megaphone;

  // Theme
  const accentFrom = isSponsored ? 'from-teal-500' : isImportant ? 'from-amber-500' : 'from-[var(--color-primary)]';
  const accentTo = isSponsored ? 'to-emerald-600' : isImportant ? 'to-orange-500' : 'to-indigo-600';
  const accentColor = isSponsored ? 'text-teal-400' : isImportant ? 'text-amber-400' : 'text-[var(--color-primary)]';
  const accentBg = isSponsored ? 'bg-teal-500' : isImportant ? 'bg-amber-500' : 'bg-[var(--color-primary)]';
  const borderColor = isSponsored ? 'border-teal-500/25' : isImportant ? 'border-amber-500/25' : 'border-[var(--color-border)]';
  const glowShadow = isSponsored ? 'shadow-teal-500/15' : isImportant ? 'shadow-amber-500/15' : 'shadow-[var(--color-primary)]/10';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={handleDismiss}
      className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full sm:max-w-md max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl border bg-[var(--color-surface)] shadow-2xl ${glowShadow} transition-all duration-300 overflow-hidden ${
          visible ? 'translate-y-0 sm:scale-100 opacity-100' : 'translate-y-full sm:translate-y-0 sm:scale-95 opacity-0'
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
          <div className="p-4 sm:p-5 space-y-4">
            {/* Icon */}
            <div className="flex flex-col items-center gap-2.5">
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${accentBg}/15`}>
                <Icon size={32} className={accentColor} />
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-center leading-tight">{title}</h3>

            {/* Message */}
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
              {message}
            </p>

            {/* Sponsor badge */}
            {isSponsored && sponsorAddress && (
              <Link
                href={`/game/profile/${sponsorAddress}`}
                onClick={handleDismiss}
                className="flex items-center gap-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] px-3.5 py-2.5 transition-colors hover:border-teal-500/30 group"
              >
                <UserAvatar address={sponsorAddress} size={24} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate group-hover:text-teal-300 transition-colors">
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

          {/* Sticky button */}
          <div className="sticky bottom-0 px-4 sm:px-5 pb-4 sm:pb-5 pt-2 bg-gradient-to-t from-[var(--color-surface)] via-[var(--color-surface)] to-transparent">
            <button
              type="button"
              onClick={handleDismiss}
              className={`w-full rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98] bg-gradient-to-r ${accentFrom} ${accentTo} shadow-lg ${glowShadow}`}
            >
              {t('common.ok')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
