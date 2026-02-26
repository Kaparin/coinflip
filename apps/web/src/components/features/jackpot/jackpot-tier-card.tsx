'use client';

import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { JackpotProgressBar } from './jackpot-progress-bar';
import { useTranslation } from '@/lib/i18n';
import type { JackpotPoolResponse } from '@coinflip/shared/types';

const TIER_STYLES: Record<string, {
  icon: string;
  border: string;
  badge: string;
  accent: string;
}> = {
  mini: {
    icon: '\uD83E\uDDF0',
    border: 'border-emerald-500/20 hover:border-emerald-500/40',
    badge: 'bg-emerald-500/15 text-emerald-400',
    accent: 'text-emerald-400',
  },
  medium: {
    icon: '\uD83D\uDCE6',
    border: 'border-blue-500/20 hover:border-blue-500/40',
    badge: 'bg-blue-500/15 text-blue-400',
    accent: 'text-blue-400',
  },
  large: {
    icon: '\uD83C\uDF81',
    border: 'border-violet-500/20 hover:border-violet-500/40',
    badge: 'bg-violet-500/15 text-violet-400',
    accent: 'text-violet-400',
  },
  mega: {
    icon: '\uD83D\uDC8E',
    border: 'border-amber-500/20 hover:border-amber-500/40',
    badge: 'bg-amber-500/15 text-amber-400',
    accent: 'text-amber-400',
  },
  super_mega: {
    icon: '\uD83D\uDC51',
    border: 'border-red-500/20 hover:border-red-500/40',
    badge: 'bg-gradient-to-r from-red-500/15 to-amber-500/15 text-amber-300',
    accent: 'text-amber-300',
  },
};

interface JackpotTierCardProps {
  pool: JackpotPoolResponse;
}

export function JackpotTierCard({ pool }: JackpotTierCardProps) {
  const { t } = useTranslation();
  const style = TIER_STYLES[pool.tierName] ?? TIER_STYLES.mini!;
  const currentFormatted = formatLaunch(pool.currentAmount);
  const targetFormatted = formatLaunch(pool.targetAmount);
  const isFull = pool.progress >= 100;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${style.border} bg-[var(--color-surface)] transition-all duration-300 ${
        isFull ? 'animate-shake' : ''
      }`}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Shimmer when nearly full */}
      {pool.progress > 80 && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent animate-shimmer pointer-events-none" />
      )}

      <div className="relative p-4">
        {/* Header: icon + name + cycle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{style.icon}</span>
            <div>
              <h3 className={`text-sm font-bold ${style.accent}`}>
                {t(`jackpot.tiers.${pool.tierName}`)}
              </h3>
              <span className="text-[10px] text-[var(--color-text-secondary)]">
                #{pool.cycle}
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

        {/* Min games requirement */}
        <div className="mt-2 text-[10px] text-[var(--color-text-secondary)]">
          {t('jackpot.minGames', { count: getMinGamesForTier(pool.tierName) })}
        </div>
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

function getMinGamesForTier(tierName: string): number {
  const map: Record<string, number> = {
    mini: 50,
    medium: 100,
    large: 200,
    mega: 500,
    super_mega: 1000,
  };
  return map[tierName] ?? 50;
}
