'use client';

import { formatLaunch } from '@coinflip/shared/constants';
import { Trophy, CheckCircle, Crown, Medal } from 'lucide-react';
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

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

/* ─── Podium config ─────────────────────────────────────── */

const PODIUM = [
  {
    place: 2,
    order: 'order-1',
    height: 'h-20',
    medal: '🥈',
    gradient: 'from-slate-400/20 via-slate-300/10 to-transparent',
    border: 'border-slate-400/30',
    barGradient: 'from-slate-400 to-slate-500',
    textColor: 'text-slate-300',
    avatarSize: 32,
    amountSize: 'text-sm',
  },
  {
    place: 1,
    order: 'order-2',
    height: 'h-28',
    medal: '🥇',
    gradient: 'from-amber-500/20 via-amber-400/10 to-transparent',
    border: 'border-amber-500/40',
    barGradient: 'from-amber-400 to-yellow-500',
    textColor: 'text-amber-400',
    avatarSize: 40,
    amountSize: 'text-base',
  },
  {
    place: 3,
    order: 'order-3',
    height: 'h-16',
    medal: '🥉',
    gradient: 'from-amber-700/20 via-amber-600/10 to-transparent',
    border: 'border-amber-700/30',
    barGradient: 'from-amber-700 to-amber-800',
    textColor: 'text-amber-600',
    avatarSize: 28,
    amountSize: 'text-xs',
  },
] as const;

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

  const winnerByRank = new Map<number, WinnerEntry>();
  if (winners) {
    for (const w of winners) {
      winnerByRank.set(w.finalRank, w);
    }
  }
  const hasWinners = winnerByRank.size > 0;

  const podiumPrizes = prizes.filter((p) => p.place <= 3);
  const restPrizes = prizes.filter((p) => p.place > 3);

  return (
    <div className="space-y-3">
      {/* ─── Podium ─────────────────────────────────── */}
      {podiumPrizes.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 pb-0 overflow-hidden">
          {/* Podium columns: 2nd | 1st | 3rd */}
          <div className="flex items-end justify-center gap-2">
            {PODIUM.filter((p) => podiumPrizes.some((pp) => pp.place === p.place)).map((config) => {
              const prize = podiumPrizes.find((p) => p.place === config.place)!;
              const winner = winnerByRank.get(config.place);

              return (
                <div
                  key={config.place}
                  className={`${config.order} flex flex-1 max-w-[140px] flex-col items-center`}
                >
                  {/* Medal + avatar/crown area */}
                  <div className="flex flex-col items-center gap-1.5 mb-2">
                    {/* Crown for 1st place */}
                    {config.place === 1 && (
                      <Crown size={20} className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
                    )}

                    {/* Avatar or medal */}
                    {winner ? (
                      <div className="relative">
                        <UserAvatar address={winner.address} size={config.avatarSize} />
                        {winner.prizeTxHash && (
                          <CheckCircle
                            size={12}
                            className="absolute -bottom-0.5 -right-0.5 text-emerald-400 bg-[var(--color-surface)] rounded-full"
                          />
                        )}
                      </div>
                    ) : (
                      <span className={config.place === 1 ? 'text-2xl' : 'text-xl'}>
                        {config.medal}
                      </span>
                    )}

                    {/* Winner name or place label */}
                    {winner ? (
                      <span className="text-[10px] font-medium truncate max-w-full text-center">
                        {winner.nickname ?? shortAddr(winner.address)}
                      </span>
                    ) : null}

                    {/* Prize amount */}
                    <div className="flex items-center gap-0.5">
                      <span className={`font-bold tabular-nums text-emerald-400 ${config.amountSize}`}>
                        {formatLaunch(prize.amount)}
                      </span>
                      <LaunchTokenIcon size={config.place === 1 ? 36 : 28} />
                    </div>
                  </div>

                  {/* Podium bar */}
                  <div
                    className={`${config.height} w-full rounded-t-lg bg-gradient-to-t ${config.gradient} border-t border-x ${config.border} flex items-start justify-center pt-2`}
                  >
                    <span className={`text-xs font-bold ${config.textColor}`}>
                      #{config.place}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Remaining places (4th, 5th, etc.) ──────── */}
      {restPrizes.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-border)]/30">
          {restPrizes.map((prize) => {
            const winner = winnerByRank.get(prize.place);
            return (
              <div
                key={prize.place}
                className="flex items-center justify-between px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 shrink-0">
                    <Medal size={14} className="text-[var(--color-text-secondary)]" />
                  </div>
                  {winner ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar address={winner.address} size={22} />
                      <span className="text-xs font-medium truncate">
                        {winner.nickname ?? shortAddr(winner.address)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      #{prize.place}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm font-bold tabular-nums text-emerald-400">
                    {formatLaunch(prize.amount)}
                  </span>
                  <LaunchTokenIcon size={28} />
                  {winner?.prizeTxHash && (
                    <CheckCircle size={12} className="text-emerald-400 ml-0.5" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Raffle seed ────────────────────────────── */}
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
