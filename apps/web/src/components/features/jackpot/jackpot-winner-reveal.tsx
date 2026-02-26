'use client';

import { useState, useEffect } from 'react';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import { Trophy, Sparkles, X } from 'lucide-react';
import Link from 'next/link';

interface JackpotWinnerRevealProps {
  tierName: string;
  amount: string;
  winnerAddress: string;
  winnerNickname?: string | null;
  onClose: () => void;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export function JackpotWinnerReveal({
  tierName,
  amount,
  winnerAddress,
  winnerNickname,
  onClose,
}: JackpotWinnerRevealProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true));

    // Auto-close after 8 seconds
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-[var(--color-surface)] backdrop-blur-sm shadow-lg shadow-amber-500/10">
        {/* Confetti shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/[0.06] to-transparent animate-shimmer pointer-events-none" />

        <div className="relative flex items-center gap-3 px-4 py-3">
          <div className="relative shrink-0">
            <div className="absolute -inset-2 rounded-full bg-amber-400/15 blur-md animate-pulse-glow" />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/25 to-amber-600/15 border border-amber-500/30">
              <Trophy size={20} className="text-amber-400" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-400/80 font-bold mb-0.5">
              <Sparkles size={10} />
              {t('jackpot.wonTitle')}
            </div>
            <div className="flex items-center gap-1.5">
              <Link
                href={`/game/profile/${winnerAddress}`}
                className="text-sm font-bold truncate max-w-[120px] hover:text-amber-400 transition-colors"
              >
                {winnerNickname || shortAddr(winnerAddress)}
              </Link>
              <span className="text-xs text-[var(--color-text-secondary)]">
                {t('jackpot.wonVerb')}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-lg font-black tabular-nums text-amber-400 leading-tight">
              +{formatLaunch(amount)}
            </div>
            <div className="flex items-center justify-end gap-0.5 mt-0.5">
              <LaunchTokenIcon size={10} />
              <span className="text-[9px] text-[var(--color-text-secondary)] font-medium">
                {t(`jackpot.tiers.${tierName}`)}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            <X size={12} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>
      </div>
    </div>
  );
}
