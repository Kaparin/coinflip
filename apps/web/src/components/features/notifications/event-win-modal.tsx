'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import Image from 'next/image';
import { Trophy, Wallet } from 'lucide-react';
import { GameTokenIcon } from '@/components/ui';
import { formatLaunch } from '@coinflip/shared/constants';
import { useTranslation } from '@/lib/i18n';

interface EventWinModalProps {
  open: boolean;
  onDismiss: () => void;
  eventTitle: string;
  rank: number;
  prizeAmount: string;
}

const RANK_THEMES: Record<number, { gradient: string; glow: string; textColor: string; medal: string }> = {
  1: {
    gradient: 'from-amber-500/30 via-amber-600/10 to-transparent',
    glow: 'drop-shadow-[0_0_30px_rgba(245,158,11,0.7)]',
    textColor: 'text-amber-400',
    medal: '1st',
  },
  2: {
    gradient: 'from-slate-300/20 via-slate-400/10 to-transparent',
    glow: 'drop-shadow-[0_0_20px_rgba(148,163,184,0.6)]',
    textColor: 'text-slate-300',
    medal: '2nd',
  },
  3: {
    gradient: 'from-orange-600/20 via-orange-700/10 to-transparent',
    glow: 'drop-shadow-[0_0_20px_rgba(234,88,12,0.6)]',
    textColor: 'text-orange-400',
    medal: '3rd',
  },
};

const DEFAULT_THEME = {
  gradient: 'from-emerald-500/20 via-emerald-600/10 to-transparent',
  glow: 'drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]',
  textColor: 'text-emerald-400',
  medal: '',
};

export function EventWinModal({ open, onDismiss, eventTitle, rank, prizeAmount }: EventWinModalProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const confettiFired = useRef(false);

  const theme = RANK_THEMES[rank] ?? DEFAULT_THEME;
  const formattedAmount = formatLaunch(Number(prizeAmount));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      confettiFired.current = false;
    }
  }, [open]);

  // Fire confetti on open
  useEffect(() => {
    if (!open || confettiFired.current) return;
    confettiFired.current = true;

    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#f59e0b', '#fbbf24', '#10b981', '#3b82f6', '#8b5cf6'],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#f59e0b', '#fbbf24', '#10b981', '#3b82f6', '#8b5cf6'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#f59e0b', '#fbbf24', '#10b981', '#3b82f6', '#8b5cf6'],
    });
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full sm:max-w-sm overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-center transition-all duration-500 ${
          visible ? 'translate-y-0 sm:scale-100 opacity-100' : 'translate-y-full sm:translate-y-0 sm:scale-75 opacity-0'
        }`}
      >
        {/* Background tournament image */}
        <div className="relative h-36 w-full">
          <Image
            src="/solo-tournament.png"
            alt=""
            fill
            className="object-cover brightness-[0.35]"
          />
          {/* Overlay gradient */}
          <div className={`absolute inset-0 bg-gradient-to-b ${theme.gradient}`} />
          {/* Trophy icon centered */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm border border-white/10 ${theme.glow}`}>
              <Trophy size={40} className={theme.textColor} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          {/* Title */}
          <h2 className="text-xl font-bold mb-1">
            {t('events.winModal.title')}
          </h2>

          {/* Event name */}
          <p className="text-sm text-[var(--color-text-secondary)] mb-1 line-clamp-1">
            {eventTitle}
          </p>

          {/* Rank */}
          <p className={`text-sm font-bold mb-4 ${theme.textColor}`}>
            {t('events.winModal.rank', { rank: String(rank) })}
          </p>

          {/* Prize amount */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className={`text-3xl font-black tabular-nums ${theme.textColor}`}>
              +{formattedAmount}
            </span>
            <GameTokenIcon size={20} />
          </div>

          {/* Wallet hint */}
          <div className="flex items-center justify-center gap-1.5 mb-5 rounded-lg bg-[var(--color-bg)] px-3 py-2">
            <Wallet size={14} className="shrink-0 text-[var(--color-text-secondary)]" />
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              {t('events.winModal.walletHint')}
            </p>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={onDismiss}
            className={`w-full rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98] ${
              rank === 1 ? 'bg-gradient-to-r from-amber-500 to-yellow-500' :
              rank === 2 ? 'bg-slate-500' :
              rank === 3 ? 'bg-orange-500' :
              'bg-emerald-500'
            }`}
          >
            {t('events.winModal.dismiss')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
