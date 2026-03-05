'use client';

import { useState } from 'react';
import { formatLaunch, VIP_JACKPOT_TIERS } from '@coinflip/shared/constants';
import { GameTokenIcon } from '@/components/ui';
import { JackpotProgressBar } from './jackpot-progress-bar';
import { VipInfoModal } from '@/components/features/vip/vip-info-modal';
import { useTranslation } from '@/lib/i18n';
import { Crown } from 'lucide-react';
import Image from 'next/image';
import type { JackpotPoolResponse } from '@coinflip/shared/types';

const VIP_BADGE_STYLES: Record<string, { gradient: string; text: string }> = {
  silver: { gradient: 'from-gray-400/20 to-gray-300/10 border-gray-400/30', text: 'text-gray-300' },
  gold: { gradient: 'from-yellow-500/20 to-amber-400/10 border-amber-400/30', text: 'text-amber-400' },
  diamond: { gradient: 'from-purple-500/20 to-pink-500/10 border-purple-400/30', text: 'text-purple-300' },
};

interface TierStyle {
  image: string;
  border: string;
  badge: string;
  accent: string;
  iconGlow: string;
  shimmerColor: string;
}

const TIER_STYLES: Record<string, TierStyle> = {
  mini: {
    image: '/jackpot-pack-1.png',
    border: 'border-emerald-500/20 hover:border-emerald-500/40',
    badge: 'bg-emerald-500/15 text-emerald-400',
    accent: 'text-emerald-400',
    iconGlow: 'bg-emerald-400/10',
    shimmerColor: 'via-emerald-400/[0.03]',
  },
  medium: {
    image: '/jackpot-pack-2.png',
    border: 'border-blue-500/20 hover:border-blue-500/40',
    badge: 'bg-blue-500/15 text-blue-400',
    accent: 'text-blue-400',
    iconGlow: 'bg-blue-400/10',
    shimmerColor: 'via-blue-400/[0.03]',
  },
  large: {
    image: '/jackpot-pack-3.png',
    border: 'border-violet-500/20 hover:border-violet-500/40',
    badge: 'bg-violet-500/15 text-violet-400',
    accent: 'text-violet-400',
    iconGlow: 'bg-violet-400/10',
    shimmerColor: 'via-violet-400/[0.03]',
  },
  mega: {
    image: '/jackpot-pack-4.png',
    border: 'border-amber-500/20 hover:border-amber-500/40',
    badge: 'bg-amber-500/15 text-amber-400',
    accent: 'text-amber-400',
    iconGlow: 'bg-amber-400/10',
    shimmerColor: 'via-amber-400/[0.03]',
  },
  super_mega: {
    image: '/jackpot-pack-5.png',
    border: 'border-rose-500/20 hover:border-rose-500/40',
    badge: 'bg-gradient-to-r from-rose-500/15 to-amber-500/15 text-rose-300',
    accent: 'text-rose-300',
    iconGlow: 'bg-rose-400/10',
    shimmerColor: 'via-rose-400/[0.03]',
  },
};

interface JackpotTierCardProps {
  pool: JackpotPoolResponse;
}

export function JackpotTierCard({ pool }: JackpotTierCardProps) {
  const { t } = useTranslation();
  const [vipInfoOpen, setVipInfoOpen] = useState(false);
  const style = TIER_STYLES[pool.tierName] ?? TIER_STYLES.mini!;
  const currentFormatted = formatLaunch(pool.currentAmount);
  const targetFormatted = formatLaunch(pool.targetAmount);
  const isNearlyFull = pool.progress >= 80;
  const isAlmostDone = pool.progress >= 95;
  const requiredVip = VIP_JACKPOT_TIERS[pool.tierName];
  const vipBadgeStyle = requiredVip ? VIP_BADGE_STYLES[requiredVip] : null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${style.border} bg-[var(--color-surface)] transition-all duration-300 ${
        isAlmostDone ? 'animate-shake' : ''
      }`}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Shimmer when nearly full */}
      {isNearlyFull && (
        <div className={`absolute inset-0 bg-gradient-to-r from-transparent ${style.shimmerColor} to-transparent animate-shimmer pointer-events-none`} />
      )}

      <div className="relative flex items-center gap-3 p-3">
        {/* Tier image — left column */}
        <div className="relative shrink-0 self-center">
          <div className={`absolute -inset-2 rounded-full ${style.iconGlow} blur-lg ${isNearlyFull ? 'animate-pulse-glow' : ''}`} />
          <Image
            src={style.image}
            alt={pool.tierName}
            width={64}
            height={64}
            className="relative drop-shadow-lg"
            sizes="64px"
          />
        </div>

        {/* Content — right column */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Tier name + VIP badge + status */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className={`text-sm font-bold truncate ${style.accent}`}>
                {t(`jackpot.tiers.${pool.tierName}`)}
              </h3>
              {requiredVip && vipBadgeStyle ? (
                <span
                  onClick={() => setVipInfoOpen(true)}
                  className={`inline-flex shrink-0 items-center rounded-full border bg-gradient-to-r ${vipBadgeStyle.gradient} font-bold leading-none ${vipBadgeStyle.text} cursor-pointer`}
                  style={{ gap: 2, padding: '2px 6px', fontSize: 9 }}
                >
                  <Crown style={{ width: 8, height: 8, flexShrink: 0 }} />
                  <span className="capitalize">{requiredVip}</span>
                </span>
              ) : null}
            </div>
            <span className={`shrink-0 font-bold rounded-full ${style.badge}`} style={{ fontSize: 10, padding: '2px 8px' }}>
              {pool.status === 'filling'
                ? `${pool.progress}%`
                : pool.status === 'drawing'
                  ? t('jackpot.drawing')
                  : t('jackpot.completed')}
            </span>
          </div>

          {/* Row 2: Cycle + min games */}
          <div className="text-[10px] text-[var(--color-text-secondary)] mb-2">
            #{pool.cycle} · {t('jackpot.minGames', { count: pool.minGames })}
          </div>

          {/* Row 3: Progress bar */}
          <JackpotProgressBar progress={pool.progress} tierName={pool.tierName} />

          {/* Row 4: Amount */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              <GameTokenIcon size={12} />
              <span className={`text-sm font-bold tabular-nums ${style.accent}`}>
                {currentFormatted}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[var(--color-text-secondary)]">
                / {targetFormatted}
              </span>
              <GameTokenIcon size={10} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      {requiredVip && ['silver', 'gold', 'diamond'].includes(requiredVip) && (
        <VipInfoModal
          open={vipInfoOpen}
          onClose={() => setVipInfoOpen(false)}
          tier={requiredVip as 'silver' | 'gold' | 'diamond'}
          context="jackpot"
          jackpotTierName={t(`jackpot.tiers.${pool.tierName}`)}
        />
      )}
    </div>
  );
}
