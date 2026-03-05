'use client';

import { useState, useEffect } from 'react';
import { formatLaunch } from '@coinflip/shared/constants';
import { GameTokenIcon } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import { Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const TIER_IMAGES: Record<string, string> = {
  mini: '/jackpot-pack-1.png',
  medium: '/jackpot-pack-2.png',
  large: '/jackpot-pack-3.png',
  mega: '/jackpot-pack-4.png',
  super_mega: '/jackpot-pack-5.png',
};

const TIER_ACCENTS: Record<string, string> = {
  mini: 'text-emerald-400 border-emerald-500/30 shadow-emerald-500/20',
  medium: 'text-blue-400 border-blue-500/30 shadow-blue-500/20',
  large: 'text-violet-400 border-violet-500/30 shadow-violet-500/20',
  mega: 'text-amber-400 border-amber-500/30 shadow-amber-500/20',
  super_mega: 'text-rose-300 border-rose-500/30 shadow-rose-500/20',
};

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
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(onClose, 10000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const packImage = TIER_IMAGES[tierName] ?? TIER_IMAGES.mini!;
  const accent = TIER_ACCENTS[tierName] ?? TIER_ACCENTS.mini!;
  const accentColor = accent.split(' ')[0]!; // e.g. 'text-amber-400'

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Content card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-xs overflow-hidden rounded-2xl border bg-[var(--color-surface)] shadow-2xl transition-all duration-500 ${accent.split(' ').slice(1).join(' ')} ${
          visible ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8'
        }`}
      >
        {/* Shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-shimmer pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        >
          <X size={14} className="text-[var(--color-text-secondary)]" />
        </button>

        <div className="relative flex flex-col items-center px-5 pt-6 pb-5 gap-4">
          {/* Title */}
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400">
            <Sparkles size={12} />
            {t('jackpot.wonTitle')}
            <Sparkles size={12} />
          </div>

          {/* Animated pack image */}
          <div className="relative">
            <div className="absolute -inset-6 rounded-full bg-amber-400/10 blur-2xl animate-pulse" />
            <div className="relative animate-bounce-slow">
              <Image
                src={packImage}
                alt={tierName}
                width={120}
                height={120}
                className="drop-shadow-[0_0_20px_rgba(251,191,36,0.3)]"
                sizes="120px"
              />
            </div>
          </div>

          {/* Tier name */}
          <span className={`text-sm font-bold ${accentColor}`}>
            {t(`jackpot.tiers.${tierName}`)}
          </span>

          {/* Amount */}
          <div className="flex items-center gap-2">
            <GameTokenIcon size={20} />
            <span className="text-2xl font-black tabular-nums text-amber-400">
              +{formatLaunch(amount)}
            </span>
          </div>

          {/* Winner */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-[var(--color-text-secondary)]">{t('jackpot.wonVerb')}</span>
            <Link
              href={`/game/profile/${winnerAddress}`}
              className="font-bold hover:text-amber-400 transition-colors truncate max-w-[160px]"
            >
              {winnerNickname || shortAddr(winnerAddress)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
