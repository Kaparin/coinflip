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
  eventType?: string;
}

const RANK_ICONS = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];

function getRankStyle(place: number): string {
  if (place === 1) return 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent border-glow-raffle';
  if (place === 2) return 'border-slate-400/30 bg-gradient-to-r from-slate-400/8 to-transparent';
  if (place === 3) return 'border-amber-700/30 bg-gradient-to-r from-amber-700/8 to-transparent';
  return '';
}

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
      {prizes.map((prize, i) => {
        const rankStyle = getRankStyle(prize.place);
        const isFirst = prize.place === 1;
        const staggerClass = i < 10 ? `stagger-${i + 1}` : '';

        return (
          <div
            key={prize.place}
            className={`animate-fade-up ${staggerClass} relative flex items-center justify-between overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${
              isFirst ? 'px-4 py-3' : 'px-3 py-2'
            } ${rankStyle}`}
          >
            {/* Shimmer for 1st place */}
            {isFirst && (
              <div className="shimmer-overlay absolute inset-0 pointer-events-none" />
            )}

            <div className="relative flex items-center gap-2">
              <span className={isFirst ? 'text-lg' : 'text-base'}>
                {RANK_ICONS[prize.place] ?? `#${prize.place}`}
              </span>
              <span className={`font-medium ${isFirst ? 'text-base' : 'text-sm'}`}>
                {prize.label ?? `${prize.place}${prize.place === 1 ? 'st' : prize.place === 2 ? 'nd' : prize.place === 3 ? 'rd' : 'th'} Place`}
              </span>
            </div>
            <div className="relative flex items-center gap-1.5">
              <span className={`font-bold text-[var(--color-success)] ${isFirst ? 'text-base' : 'text-sm'}`}>
                {formatLaunch(prize.amount)}
              </span>
              <LaunchTokenIcon size={isFirst ? 40 : 36} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
