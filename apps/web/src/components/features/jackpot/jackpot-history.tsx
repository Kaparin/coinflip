'use client';

import { useState } from 'react';
import { formatLaunch } from '@coinflip/shared/constants';
import { GameTokenIcon } from '@/components/ui';
import { useJackpotHistory } from '@/hooks/use-jackpot';
import { useTranslation } from '@/lib/i18n';
import { Trophy } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import type { JackpotPoolResponse } from '@coinflip/shared/types';

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

const TIER_STYLE: Record<string, {
  image: string;
  accent: string;
  border: string;
  bg: string;
  glow: string;
}> = {
  mini: {
    image: '/jackpot-pack-1.png',
    accent: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/5',
    glow: 'bg-emerald-400/10',
  },
  medium: {
    image: '/jackpot-pack-2.png',
    accent: 'text-blue-400',
    border: 'border-blue-500/20',
    bg: 'bg-blue-500/5',
    glow: 'bg-blue-400/10',
  },
  large: {
    image: '/jackpot-pack-3.png',
    accent: 'text-violet-400',
    border: 'border-violet-500/20',
    bg: 'bg-violet-500/5',
    glow: 'bg-violet-400/10',
  },
  mega: {
    image: '/jackpot-pack-4.png',
    accent: 'text-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/5',
    glow: 'bg-amber-400/10',
  },
  super_mega: {
    image: '/jackpot-pack-5.png',
    accent: 'text-rose-300',
    border: 'border-rose-500/20',
    bg: 'bg-rose-500/5',
    glow: 'bg-rose-400/10',
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function JackpotHistory() {
  const [page, setPage] = useState(0);
  const limit = 20;
  const { data: history, isLoading } = useJackpotHistory(limit, page * limit);
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">
        {t('jackpot.noHistory')}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {history.map((pool) => (
        <HistoryCard key={pool.id} pool={pool} t={t} />
      ))}

      {history.length >= limit && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border border-[var(--color-border)] px-5 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            {t('jackpot.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryCard({
  pool,
  t,
}: {
  pool: JackpotPoolResponse;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const style = TIER_STYLE[pool.tierName] ?? TIER_STYLE.mini!;

  return (
    <div className={`relative overflow-hidden rounded-xl border ${style.border} bg-[var(--color-surface)] transition-all`}>
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="flex items-center gap-3 p-3">
        {/* Tier image */}
        <div className="relative shrink-0">
          <div className={`absolute -inset-1.5 rounded-full ${style.glow} blur-md`} />
          <Image
            src={style.image}
            alt={pool.tierName}
            width={52}
            height={52}
            className="relative drop-shadow-lg"
            sizes="52px"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-sm font-bold ${style.accent}`}>
              {t(`jackpot.tiers.${pool.tierName}`)}
            </span>
            <span className="text-[10px] text-[var(--color-text-secondary)] font-mono">
              #{pool.cycle}
            </span>
          </div>

          {pool.winnerAddress ? (
            <Link
              href={`/game/profile/${pool.winnerAddress}`}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Trophy size={10} className="text-amber-400 shrink-0" />
              <span className="truncate">
                {pool.winnerNickname || shortAddr(pool.winnerAddress)}
              </span>
            </Link>
          ) : (
            <span className="text-xs text-[var(--color-text-secondary)]">
              {t('jackpot.noWinner')}
            </span>
          )}

          {pool.completedAt && (
            <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
              {formatDate(pool.completedAt)}
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1 justify-end">
            <span className={`text-sm font-bold tabular-nums ${style.accent}`}>
              {formatLaunch(pool.currentAmount)}
            </span>
            <GameTokenIcon size={14} />
          </div>
        </div>
      </div>
    </div>
  );
}
