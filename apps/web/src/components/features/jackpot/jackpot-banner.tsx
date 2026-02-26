'use client';

import { useJackpotActive } from '@/hooks/use-jackpot';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { GiOpenTreasureChest } from 'react-icons/gi';

/**
 * Jackpot banner shown on the main game page.
 * Red-violet theme with treasure chest icon.
 * Displays total amount across all pools + closest to draw.
 */
export function JackpotBanner() {
  const { data: pools, isLoading } = useJackpotActive();
  const { t } = useTranslation();

  if (isLoading || !pools || pools.length === 0) return null;

  // Total across all pools
  const totalAmount = pools.reduce((sum, p) => sum + BigInt(p.currentAmount), 0n);
  const totalFormatted = formatLaunch(totalAmount.toString());

  // Closest to draw (highest progress)
  const closest = pools.reduce((best, pool) =>
    pool.progress > best.progress ? pool : best,
  );

  return (
    <Link href="/game/jackpot" className="group block">
      <div className="relative overflow-hidden rounded-xl border border-rose-500/20 bg-[var(--color-surface)]">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-400/60 to-transparent" />

        {/* Shimmer sweep */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-rose-400/[0.04] to-transparent animate-shimmer pointer-events-none" />

        <div className="relative flex items-center gap-3 px-3.5 py-2.5">
          {/* Treasure chest icon with glow */}
          <div className="relative shrink-0">
            <div className="absolute -inset-1.5 rounded-full bg-rose-400/10 blur-md" />
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-400/20 to-violet-600/10 border border-rose-500/25">
              <GiOpenTreasureChest size={18} className="text-rose-400 drop-shadow-[0_0_6px_rgba(251,113,133,0.5)]" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-[0.15em] text-rose-400/70 font-bold leading-none mb-1">
              {t('jackpot.bannerTitle')}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--color-text-secondary)]">
                {t('jackpot.bannerPools', { count: pools.length })}
              </span>
              <span className="text-[9px] text-[var(--color-text-secondary)]">·</span>
              <span className="text-[10px] text-rose-400/80 font-medium">
                {t(`jackpot.tiers.${closest.tierName}`)} {closest.progress}%
              </span>
            </div>
          </div>

          {/* Total amount */}
          <div className="shrink-0 flex items-center gap-2">
            <div className="text-right">
              <div className="text-base font-black tabular-nums text-rose-400 leading-tight tracking-tight">
                {totalFormatted}
              </div>
              <div className="flex items-center justify-end gap-0.5 mt-0.5">
                <LaunchTokenIcon size={10} />
                <span className="text-[9px] text-[var(--color-text-secondary)] font-medium">
                  {t('jackpot.bannerTotal')}
                </span>
              </div>
            </div>
            <ChevronRight
              size={14}
              className="text-[var(--color-text-secondary)] group-hover:text-rose-400 transition-colors shrink-0"
            />
          </div>
        </div>

        {/* Mini progress bar at bottom */}
        <div className="h-0.5 bg-rose-500/10">
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-violet-400 transition-all duration-700"
            style={{ width: `${Math.min(100, closest.progress)}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
