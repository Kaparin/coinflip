'use client';

import { useTopWinner } from '@/hooks/use-top-winner';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import { GiTrophy } from 'react-icons/gi';

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
    <div className="relative inline-flex overflow-hidden rounded-lg border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-yellow-500/10 px-2.5 py-1.5">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/5 to-transparent animate-shimmer pointer-events-none" />
      <div className="relative flex items-center gap-1.5">
        <GiTrophy size={14} className="text-yellow-500 shrink-0" />
        <span className="text-[10px] font-medium text-[var(--color-text-secondary)] shrink-0">
          {t('topWinner.label')}
        </span>
        <Link
          href={`/game/profile/${winner.address}`}
          className="text-[11px] font-bold truncate max-w-[100px] hover:text-yellow-500 transition-colors"
        >
          {displayName}
        </Link>
        <span className="text-[11px] font-bold tabular-nums text-yellow-500">
          +{payoutFormatted}
        </span>
        <LaunchTokenIcon size={14} />
      </div>
    </div>
  );
}
