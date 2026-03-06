'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp } from 'lucide-react';
import { fetchStakingStats, formatNumber, STAKING_CONTRACT, type StakingStats } from '@/lib/staking';
import { useTranslation } from '@/lib/i18n';

/**
 * Compact banner showing LAUNCH staking payouts from Heads or Tails.
 * Designed to sit in the game area between TopWinnerBanner and bet tabs.
 */
export function StakingRevenueBanner() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<StakingStats | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStakingStats();
      setStats(s);
    } catch {
      /* contract may not be deployed yet */
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!stats || (stats.totalDistributed === 0 && stats.totalStakers === 0)) return null;

  return (
    <div className="rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/[0.07] via-[var(--color-surface)] to-purple-500/[0.07] overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
          <TrendingUp size={15} className="text-violet-400" />
        </div>

        {/* Stats row */}
        <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] leading-tight">
              {t('staking.launchPayouts')}
            </p>
            <p className="text-sm font-bold tabular-nums leading-tight">
              <span className="text-emerald-400">{formatNumber(stats.totalDistributed)}</span>
              <span className="text-[var(--color-text-secondary)]"> AXM</span>
            </p>
          </div>

          {/* Divider */}
          <div className="h-7 w-px bg-[var(--color-border)] shrink-0" />

          {/* Stakers */}
          <div className="text-right shrink-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] leading-tight">
              {t('staking.stakers')}
            </p>
            <p className="text-sm font-bold tabular-nums leading-tight">
              {stats.totalStakers}
            </p>
          </div>

          {/* Divider */}
          <div className="h-7 w-px bg-[var(--color-border)] shrink-0" />

          {/* Rate badge */}
          <div className="shrink-0">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-400 leading-tight">
              20% {t('staking.ofCommission')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
