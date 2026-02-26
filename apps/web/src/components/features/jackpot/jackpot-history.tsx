'use client';

import { useState } from 'react';
import { formatLaunch } from '@coinflip/shared/constants';
import { LaunchTokenIcon } from '@/components/ui';
import { useJackpotHistory } from '@/hooks/use-jackpot';
import { useTranslation } from '@/lib/i18n';
import { ChevronDown, Copy, CheckCircle, Trophy } from 'lucide-react';
import Link from 'next/link';
import type { JackpotPoolResponse } from '@coinflip/shared/types';

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

const TIER_ACCENT: Record<string, string> = {
  mini: 'text-emerald-400',
  medium: 'text-blue-400',
  large: 'text-violet-400',
  mega: 'text-amber-400',
  super_mega: 'text-amber-300',
};

const TIER_ICON: Record<string, string> = {
  mini: '\uD83E\uDDF0',
  medium: '\uD83D\uDCE6',
  large: '\uD83C\uDF81',
  mega: '\uD83D\uDC8E',
  super_mega: '\uD83D\uDC51',
};

export function JackpotHistory() {
  const [page, setPage] = useState(0);
  const limit = 20;
  const { data: history, isLoading } = useJackpotHistory(limit, page * limit);
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedSeed, setCopiedSeed] = useState(false);

  const copySeed = (seed: string) => {
    navigator.clipboard.writeText(seed);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-[var(--color-surface)] animate-pulse" />
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
    <div className="space-y-2">
      {history.map((pool, idx) => (
        <HistoryItem
          key={pool.id}
          pool={pool}
          index={page * limit + idx + 1}
          isExpanded={expandedId === pool.id}
          onToggle={() => setExpandedId(expandedId === pool.id ? null : pool.id)}
          onCopySeed={copySeed}
          copiedSeed={copiedSeed}
          t={t}
        />
      ))}

      {/* Pagination */}
      {history.length >= limit && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            {t('jackpot.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryItem({
  pool,
  index,
  isExpanded,
  onToggle,
  onCopySeed,
  copiedSeed,
  t,
}: {
  pool: JackpotPoolResponse;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onCopySeed: (seed: string) => void;
  copiedSeed: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const accent = TIER_ACCENT[pool.tierName] ?? 'text-emerald-400';
  const icon = TIER_ICON[pool.tierName] ?? '\uD83E\uDDF0';

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-xs text-[var(--color-text-secondary)] font-mono w-6">
          #{index}
        </span>
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold ${accent}`}>
              {t(`jackpot.tiers.${pool.tierName}`)}
            </span>
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              #{pool.cycle}
            </span>
          </div>
          {pool.winnerAddress && (
            <Link
              href={`/game/profile/${pool.winnerAddress}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Trophy size={10} className="inline mr-0.5" />
              {pool.winnerNickname || shortAddr(pool.winnerAddress)}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-sm font-bold tabular-nums ${accent}`}>
            {formatLaunch(pool.currentAmount)}
          </span>
          <LaunchTokenIcon size={12} />
          <ChevronDown
            size={14}
            className={`text-[var(--color-text-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-[var(--color-border)] text-xs space-y-1.5 animate-fade-up">
          {pool.winnerAddress && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-secondary)]">{t('jackpot.winner')}:</span>
              <Link
                href={`/game/profile/${pool.winnerAddress}`}
                className="text-[var(--color-primary)] hover:underline"
              >
                {pool.winnerNickname || shortAddr(pool.winnerAddress)}
              </Link>
            </div>
          )}
          {pool.completedAt && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-secondary)]">{t('jackpot.date')}:</span>
              <span>{new Date(pool.completedAt).toLocaleDateString()}</span>
            </div>
          )}
          {pool.drawSeed && (
            <div className="space-y-1">
              <span className="text-[var(--color-text-secondary)]">{t('jackpot.seed')}:</span>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 bg-black/20 rounded px-2 py-1 text-[10px] font-mono break-all">
                  {pool.drawSeed}
                </code>
                <button
                  onClick={() => onCopySeed(pool.drawSeed!)}
                  className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                >
                  {copiedSeed ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
