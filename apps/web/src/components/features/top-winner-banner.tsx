'use client';

import { useTopWinner } from '@/hooks/use-top-winner';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import { Crown, ChevronRight } from 'lucide-react';

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export function TopWinnerBanner() {
  const { data: winner, isLoading } = useTopWinner();
  const { t } = useTranslation();

  if (isLoading || !winner) return null;

  const displayName = winner.nickname || shortAddr(winner.address);
  const payoutFormatted = formatLaunch(winner.payout);

  return (
    <Link
      href={`/game/profile/${winner.address}`}
      className="group block"
    >
      <div className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-[var(--color-surface)]">
        {/* Top golden accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

        {/* Shimmer sweep */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/[0.04] to-transparent animate-shimmer pointer-events-none" />

        <div className="relative flex items-center gap-3 px-3.5 py-2.5">
          {/* Crown icon with glow */}
          <div className="relative shrink-0">
            <div className="absolute -inset-1.5 rounded-full bg-amber-400/10 blur-md" />
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-500/25">
              <Crown size={17} className="text-amber-400" />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-[0.15em] text-amber-400/70 font-bold leading-none mb-1">
              {t('topWinner.title')}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold truncate max-w-[120px] group-hover:text-amber-400 transition-colors">
                {displayName}
              </span>
              <span className="text-[10px] text-[var(--color-text-secondary)]">
                {t('topWinner.won')}
              </span>
            </div>
          </div>

          {/* Amount */}
          <div className="shrink-0 flex items-center gap-2">
            <div className="text-right">
              <div className="text-base font-black tabular-nums text-amber-400 leading-tight tracking-tight">
                +{payoutFormatted}
              </div>
              <div className="flex items-center justify-end gap-0.5 mt-0.5">
                <LaunchTokenIcon size={10} />
                <span className="text-[9px] text-[var(--color-text-secondary)] font-medium">LAUNCH</span>
              </div>
            </div>
            <ChevronRight size={14} className="text-[var(--color-text-secondary)] group-hover:text-amber-400 transition-colors shrink-0" />
          </div>
        </div>

        {/* Bottom golden accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
      </div>
    </Link>
  );
}
