'use client';

import { formatLaunch } from '@coinflip/shared/constants';
import { Trophy, CheckCircle, Crown } from 'lucide-react';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';

interface PrizeEntry {
  place: number;
  amount: string;
  label?: string;
}

interface WinnerEntry {
  finalRank: number;
  address: string;
  prizeAmount: string;
  prizeTxHash?: string | null;
  nickname?: string | null;
}

interface PrizeDisplayProps {
  prizes: PrizeEntry[];
  winners?: WinnerEntry[];
  compact?: boolean;
  eventType?: string;
  raffleSeed?: string | null;
  raffleSeedLabel?: string;
}

const RANK_ICONS = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];

function getRankStyle(place: number): string {
  if (place === 1) return 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent border-glow-raffle';
  if (place === 2) return 'border-slate-400/30 bg-gradient-to-r from-slate-400/8 to-transparent';
  if (place === 3) return 'border-amber-700/30 bg-gradient-to-r from-amber-700/8 to-transparent';
  return '';
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export function PrizeDisplay({ prizes, winners, compact, raffleSeed, raffleSeedLabel }: PrizeDisplayProps) {
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

  // Build a map of winners by rank for quick lookup
  const winnerByRank = new Map<number, WinnerEntry>();
  if (winners) {
    for (const w of winners) {
      winnerByRank.set(w.finalRank, w);
    }
  }

  const hasWinners = winnerByRank.size > 0;

  return (
    <div className="space-y-2">
      {prizes.map((prize, i) => {
        const rankStyle = getRankStyle(prize.place);
        const isFirst = prize.place === 1;
        const staggerClass = i < 10 ? `stagger-${i + 1}` : '';
        const winner = winnerByRank.get(prize.place);

        return (
          <div
            key={prize.place}
            className={`animate-fade-up ${staggerClass} relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${
              isFirst ? 'px-4 py-3' : 'px-3 py-2'
            } ${rankStyle}`}
          >
            {/* Crown decoration for 1st place with winner */}
            {isFirst && hasWinners && (
              <Crown
                size={48}
                className="absolute -top-1 -right-1 opacity-[0.06] text-amber-400 pointer-events-none"
                strokeWidth={1}
              />
            )}

            {/* Shimmer for 1st place */}
            {isFirst && !hasWinners && (
              <div className="shimmer-overlay absolute inset-0 pointer-events-none" />
            )}

            <div className="relative flex items-center justify-between gap-2">
              {/* Left: rank + label/winner */}
              <div className="flex items-center gap-2 min-w-0">
                <span className={`shrink-0 ${isFirst ? 'text-lg' : 'text-base'}`}>
                  {RANK_ICONS[prize.place] ?? `#${prize.place}`}
                </span>

                {winner ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <UserAvatar address={winner.address} size={isFirst ? 28 : 24} />
                    <span className={`font-medium truncate ${isFirst ? 'text-sm' : 'text-xs'}`}>
                      {winner.nickname ?? shortAddr(winner.address)}
                    </span>
                  </div>
                ) : (
                  <span className={`font-medium text-[var(--color-text-secondary)] ${isFirst ? 'text-sm' : 'text-xs'}`}>
                    {prize.label ?? `${prize.place}${prize.place === 1 ? 'st' : prize.place === 2 ? 'nd' : prize.place === 3 ? 'rd' : 'th'} Place`}
                  </span>
                )}
              </div>

              {/* Right: prize amount + paid check */}
              <div className="relative flex items-center gap-1.5 shrink-0">
                <span className={`font-bold text-[var(--color-success)] ${isFirst ? 'text-base' : 'text-sm'}`}>
                  {formatLaunch(prize.amount)}
                </span>
                <LaunchTokenIcon size={isFirst ? 40 : 36} />
                {winner?.prizeTxHash && (
                  <CheckCircle size={14} className="text-[var(--color-success)]" />
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Raffle seed */}
      {raffleSeed && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1">
            {raffleSeedLabel ?? 'Raffle Seed'}
          </p>
          <p className="text-[10px] font-mono break-all text-[var(--color-text-secondary)]">{raffleSeed}</p>
        </div>
      )}
    </div>
  );
}
