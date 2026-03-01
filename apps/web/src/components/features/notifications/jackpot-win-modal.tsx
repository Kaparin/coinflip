'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import { GiOpenTreasureChest } from 'react-icons/gi';
import { LaunchTokenIcon } from '@/components/ui';
import { formatLaunch } from '@coinflip/shared/constants';
import { useTranslation } from '@/lib/i18n';

const TIER_THEMES: Record<string, { gradient: string; glow: string; textColor: string }> = {
  mini: {
    gradient: 'from-emerald-500/20 via-emerald-600/10 to-transparent',
    glow: 'drop-shadow-[0_0_20px_rgba(16,185,129,0.6)]',
    textColor: 'text-emerald-400',
  },
  medium: {
    gradient: 'from-blue-500/20 via-blue-600/10 to-transparent',
    glow: 'drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]',
    textColor: 'text-blue-400',
  },
  large: {
    gradient: 'from-violet-500/20 via-violet-600/10 to-transparent',
    glow: 'drop-shadow-[0_0_20px_rgba(139,92,246,0.6)]',
    textColor: 'text-violet-400',
  },
  mega: {
    gradient: 'from-amber-500/20 via-amber-600/10 to-transparent',
    glow: 'drop-shadow-[0_0_20px_rgba(245,158,11,0.6)]',
    textColor: 'text-amber-400',
  },
  super_mega: {
    gradient: 'from-rose-500/20 via-rose-600/10 to-transparent',
    glow: 'drop-shadow-[0_0_30px_rgba(244,63,94,0.8)]',
    textColor: 'text-rose-400',
  },
};

interface JackpotWinModalProps {
  open: boolean;
  onDismiss: () => void;
  tierName: string;
  amount: string;
}

export function JackpotWinModal({ open, onDismiss, tierName, amount }: JackpotWinModalProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const confettiFired = useRef(false);

  const theme = TIER_THEMES[tierName] ?? TIER_THEMES.mini!;
  const displayName = t(`jackpot.tiers.${tierName}`) || tierName;
  const formattedAmount = formatLaunch(Number(amount));

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
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#f43f5e', '#f59e0b', '#8b5cf6', '#10b981', '#3b82f6'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#f43f5e', '#f59e0b', '#8b5cf6', '#10b981', '#3b82f6'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    // Big burst
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#f43f5e', '#f59e0b', '#8b5cf6', '#10b981', '#3b82f6'],
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
        className={`relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 text-center transition-all duration-500 ${
          visible ? 'translate-y-0 sm:scale-100 opacity-100' : 'translate-y-full sm:translate-y-0 sm:scale-75 opacity-0'
        }`}
      >
        {/* Gradient background */}
        <div className={`absolute inset-0 rounded-t-2xl sm:rounded-2xl bg-gradient-to-b ${theme.gradient} pointer-events-none`} />

        {/* Content */}
        <div className="relative z-10">
          {/* Treasure chest icon */}
          <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-bg)] ${theme.glow}`}>
            <GiOpenTreasureChest size={42} className={theme.textColor} />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold mb-1">
            {t('notifications.jackpotWonTitle')}
          </h2>

          {/* Tier name */}
          <p className={`text-sm font-semibold mb-4 ${theme.textColor}`}>
            {displayName} Jackpot
          </p>

          {/* Amount */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className={`text-3xl font-black tabular-nums ${theme.textColor}`}>
              +{formattedAmount}
            </span>
            <LaunchTokenIcon size={60} />
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={onDismiss}
            className={`w-full rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98] ${
              tierName === 'super_mega' ? 'bg-gradient-to-r from-rose-500 to-amber-500' :
              tierName === 'mega' ? 'bg-amber-500' :
              tierName === 'large' ? 'bg-violet-500' :
              tierName === 'medium' ? 'bg-blue-500' :
              'bg-emerald-500'
            }`}
          >
            {t('notifications.jackpotDismiss')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
