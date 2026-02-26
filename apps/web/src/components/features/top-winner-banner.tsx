'use client';

import { useTopWinner } from '@/hooks/use-top-winner';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';

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
    <div className="relative overflow-hidden rounded-xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-yellow-500/10 px-3 py-2">
      {/* Subtle shimmer */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/5 to-transparent animate-shimmer pointer-events-none" />
      <div className="relative flex items-center gap-2 h-7">
        {/* Left: trophy + label */}
        <span className="text-sm leading-none shrink-0" title={t('topWinner.title')}>&#127942;</span>
        <span className="text-[11px] font-medium text-[var(--color-text-secondary)] shrink-0 leading-none">
          {t('topWinner.label')}
        </span>
        {/* Center: player name - takes remaining space */}
        <Link
          href={`/game/profile/${winner.address}`}
          className="text-xs font-bold truncate leading-none hover:text-yellow-500 transition-colors min-w-0 flex-1"
        >
          {displayName}
        </Link>
        {/* Right: payout amount */}
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="text-xs font-bold tabular-nums text-yellow-500 leading-none">
            +{payoutFormatted}
          </span>
          <LaunchTokenIcon size={32} />
        </div>
      </div>
    </div>
  );
}
