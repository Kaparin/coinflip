'use client';

import Link from 'next/link';
import { Trophy, Users, Shield, Swords } from 'lucide-react';
import { useTranslation, pickLocalized } from '@/lib/i18n';
import { AxmIcon } from '@/components/ui/axm-icon';
import { TournamentProgressBar } from './tournament-progress-bar';
import type { Tournament } from '@/hooks/use-tournaments';

function formatAXM(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function TournamentCard({ tournament: t, index = 0 }: { tournament: Tournament; index?: number }) {
  const { t: tr, locale } = useTranslation();
  const title = pickLocalized(locale, t.title, t.titleEn, t.titleRu);

  const isRegistration = t.status === 'registration';
  const isActive = t.status === 'active';
  const isCompleted = t.status === 'completed' || t.status === 'calculating';

  const borderColor = isActive
    ? 'border-emerald-500/30'
    : isRegistration
      ? 'border-indigo-500/30'
      : 'border-[var(--color-border)]';

  return (
    <Link
      href={`/game/tournaments/${t.id}`}
      className={`block rounded-xl sm:rounded-2xl border ${borderColor} bg-[var(--color-surface)] p-3 sm:p-4 transition-all duration-200 hover:bg-[var(--color-surface-hover)] active:scale-[0.98] animate-fade-up ${isActive ? 'shimmer-overlay' : ''}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Row 1: Title + status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
            <Swords size={14} className="text-indigo-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)] truncate">{title}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isActive && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
              {t.hasPaid && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                  ✓
                </span>
              )}
            </div>
          </div>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
          isActive ? 'bg-emerald-500/15 text-emerald-400'
          : isRegistration ? 'bg-indigo-500/15 text-indigo-400'
          : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)]'
        }`}>
          {tr(`tournament.status.${t.status}`)}
        </span>
      </div>

      {/* Progress bar */}
      <TournamentProgressBar tournament={t} />

      {/* Row 2: Stats */}
      <div className="flex items-center justify-between mt-2 gap-1">
        <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-0.5">
            <Users size={11} />
            {t.participantCount}
          </span>
          <span className="flex items-center gap-0.5">
            <Shield size={11} />
            {t.teamCount}
          </span>
        </div>

        {/* Prize pool */}
        <div className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-[var(--color-warning)]">
          <Trophy size={12} />
          <span>{formatAXM(t.totalPrizePool)}</span>
          <AxmIcon size={12} />
        </div>
      </div>

      {/* Entry fee */}
      {BigInt(t.entryFee) > 0n && (
        <div className="mt-2 pt-2 border-t border-[var(--color-border)] flex items-center justify-between text-[10px] sm:text-xs">
          <span className="text-[var(--color-text-secondary)]">{tr('tournament.entryFee')}</span>
          <span className="font-medium text-[var(--color-text)] flex items-center gap-0.5">
            {formatAXM(t.entryFee)} <AxmIcon size={11} />
          </span>
        </div>
      )}
    </Link>
  );
}
