'use client';

import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { JackpotProgressBar } from './jackpot-progress-bar';
import { useTranslation } from '@/lib/i18n';
import { Coins, Zap, Flame, Crown, Sparkles, type LucideIcon } from 'lucide-react';
import type { JackpotPoolResponse } from '@coinflip/shared/types';

interface TierStyle {
  icon: LucideIcon;
  border: string;
  badge: string;
  accent: string;
  iconBg: string;
  iconGlow: string;
  iconColor: string;
  shimmerColor: string;
}

const TIER_STYLES: Record<string, TierStyle> = {
  mini: {
    icon: Coins,
    border: 'border-emerald-500/20 hover:border-emerald-500/40',
    badge: 'bg-emerald-500/15 text-emerald-400',
    accent: 'text-emerald-400',
    iconBg: 'from-emerald-400/20 to-emerald-600/10 border-emerald-500/25',
    iconGlow: 'bg-emerald-400/10',
    iconColor: 'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.4)]',
    shimmerColor: 'via-emerald-400/[0.03]',
  },
  medium: {
    icon: Zap,
    border: 'border-blue-500/20 hover:border-blue-500/40',
    badge: 'bg-blue-500/15 text-blue-400',
    accent: 'text-blue-400',
    iconBg: 'from-blue-400/20 to-blue-600/10 border-blue-500/25',
    iconGlow: 'bg-blue-400/10',
    iconColor: 'text-blue-400 drop-shadow-[0_0_6px_rgba(96,165,250,0.4)]',
    shimmerColor: 'via-blue-400/[0.03]',
  },
  large: {
    icon: Flame,
    border: 'border-violet-500/20 hover:border-violet-500/40',
    badge: 'bg-violet-500/15 text-violet-400',
    accent: 'text-violet-400',
    iconBg: 'from-violet-400/20 to-violet-600/10 border-violet-500/25',
    iconGlow: 'bg-violet-400/10',
    iconColor: 'text-violet-400 drop-shadow-[0_0_6px_rgba(167,139,250,0.4)]',
    shimmerColor: 'via-violet-400/[0.03]',
  },
  mega: {
    icon: Crown,
    border: 'border-amber-500/20 hover:border-amber-500/40',
    badge: 'bg-amber-500/15 text-amber-400',
    accent: 'text-amber-400',
    iconBg: 'from-amber-400/20 to-amber-600/10 border-amber-500/25',
    iconGlow: 'bg-amber-400/10',
    iconColor: 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]',
    shimmerColor: 'via-amber-400/[0.03]',
  },
  super_mega: {
    icon: Sparkles,
    border: 'border-red-500/20 hover:border-red-500/40',
    badge: 'bg-gradient-to-r from-red-500/15 to-amber-500/15 text-amber-300',
    accent: 'text-amber-300',
    iconBg: 'from-red-400/20 via-amber-400/15 to-yellow-400/10 border-red-500/25',
    iconGlow: 'bg-red-400/10',
    iconColor: 'text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]',
    shimmerColor: 'via-red-400/[0.03]',
  },
};

interface JackpotTierCardProps {
  pool: JackpotPoolResponse;
}

export function JackpotTierCard({ pool }: JackpotTierCardProps) {
  const { t } = useTranslation();
  const style = TIER_STYLES[pool.tierName] ?? TIER_STYLES.mini!;
  const Icon = style.icon;
  const currentFormatted = formatLaunch(pool.currentAmount);
  const targetFormatted = formatLaunch(pool.targetAmount);
  const isNearlyFull = pool.progress >= 80;
  const isAlmostDone = pool.progress >= 95;

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

      <div className="relative p-4">
        {/* Header: icon + name + cycle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {/* Icon with gradient circle + glow */}
            <div className="relative shrink-0">
              <div className={`absolute -inset-1 rounded-full ${style.iconGlow} blur-md ${isNearlyFull ? 'animate-pulse-glow' : ''}`} />
              <div className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${style.iconBg} border`}>
                <Icon size={18} className={style.iconColor} />
              </div>
            </div>
            <div>
              <h3 className={`text-sm font-bold ${style.accent}`}>
                {t(`jackpot.tiers.${pool.tierName}`)}
              </h3>
              <span className="text-[10px] text-[var(--color-text-secondary)]">
                #{pool.cycle} · {t('jackpot.minGames', { count: pool.minGames })}
              </span>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
            {pool.status === 'filling'
              ? `${pool.progress}%`
              : pool.status === 'drawing'
                ? t('jackpot.drawing')
                : t('jackpot.completed')}
          </span>
        </div>

        {/* Progress bar */}
        <JackpotProgressBar progress={pool.progress} tierName={pool.tierName} />

        {/* Amount display */}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1">
            <LaunchTokenIcon size={12} />
            <span className={`text-sm font-bold tabular-nums ${style.accent}`}>
              {currentFormatted}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--color-text-secondary)]">
              / {targetFormatted}
            </span>
            <LaunchTokenIcon size={10} />
          </div>
        </div>
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}
