'use client';

import { formatLaunch } from '@coinflip/shared/constants';
import { Trophy } from 'lucide-react';
import { LaunchTokenIcon } from '@/components/ui';

interface PrizeEntry {
  place: number;
  amount: string;
  label?: string;
}

interface PrizeDisplayProps {
  prizes: PrizeEntry[];
  compact?: boolean;
}

const RANK_ICONS = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];

export function PrizeDisplay({ prizes, compact }: PrizeDisplayProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Trophy size={12} className="text-[var(--color-warning)]" />
        <span className="font-bold">{formatLaunch(prizes[0]?.amount ?? '0')}</span>
        <LaunchTokenIcon size={32} />
        {prizes.length > 1 && (
          <span className="text-[var(--color-text-secondary)]">+{prizes.length - 1} more</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {prizes.map((prize) => (
        <div
          key={prize.place}
          className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{RANK_ICONS[prize.place] ?? `#${prize.place}`}</span>
            <span className="text-sm font-medium">
              {prize.label ?? `${prize.place}${prize.place === 1 ? 'st' : prize.place === 2 ? 'nd' : prize.place === 3 ? 'rd' : 'th'} Place`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-[var(--color-success)]">
              {formatLaunch(prize.amount)}
            </span>
            <LaunchTokenIcon size={36} />
          </div>
        </div>
      ))}
    </div>
  );
}
