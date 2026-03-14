'use client';

import Link from 'next/link';
import { Trophy, Users, Clock, Shield, Swords } from 'lucide-react';
import { useTranslation, pickLocalized } from '@/lib/i18n';
import { AxmIcon } from '@/components/ui/axm-icon';
import { TournamentProgressBar } from './tournament-progress-bar';
import type { Tournament } from '@/hooks/use-tournaments';

interface TournamentCardProps {
  tournament: Tournament;
  index?: number;
}

function formatAXM(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function TournamentCard({ tournament: t, index = 0 }: TournamentCardProps) {
  const { t: tr, locale } = useTranslation();
  const title = pickLocalized(locale, t.title, t.titleEn, t.titleRu);

  const isRegistration = t.status === 'registration';
  const isActive = t.status === 'active';
  const isCompleted = t.status === 'completed' || t.status === 'calculating';

  const statusColor = isActive
    ? 'text-emerald-400'
    : isRegistration
      ? 'text-indigo-400'
      : isCompleted
        ? 'text-amber-400'
        : 'text-[var(--color-text-secondary)]';

  const borderColor = isActive
    ? 'border-emerald-500/30'
    : isRegistration
      ? 'border-indigo-500/30'
      : 'border-[var(--color-border)]';

  return (
    <Link
      href={`/game/tournaments/${t.id}`}
      className={`block rounded-2xl border ${borderColor} bg-[var(--color-surface)] p-4 transition-all duration-300 hover:bg-[var(--color-surface-hover)] hover:scale-[1.01] active:scale-[0.99] animate-fade-up ${isActive ? 'shimmer-overlay' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Swords size={16} className="text-indigo-400 shrink-0" />
            <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
              {tr('tournament.title')}
            </span>
            {isActive && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-[var(--color-text)] truncate">{title}</h3>
        </div>

        {/* Status badge */}
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--color-bg)] ${statusColor} shrink-0`}>
          {tr(`tournament.status.${t.status}`)}
        </span>
      </div>

      {/* Progress bar */}
      <TournamentProgressBar tournament={t} />

      {/* Stats row */}
      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-1">
            <Users size={13} />
            {t.participantCount} {tr('tournament.participants')}
          </span>
          <span className="flex items-center gap-1">
            <Shield size={13} />
            {t.teamCount} {tr('tournament.teams').toLowerCase()}
          </span>
        </div>

        {/* Prize pool */}
        <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-warning)]">
          <Trophy size={14} />
          <span>{formatAXM(t.totalPrizePool)}</span>
          <AxmIcon size={14} />
        </div>
      </div>

      {/* Entry fee */}
      {BigInt(t.entryFee) > 0n && (
        <div className="mt-2 pt-2 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
          <span className="text-[var(--color-text-secondary)]">{tr('tournament.entryFee')}</span>
          <span className="font-medium text-[var(--color-text)] flex items-center gap-1">
            {formatAXM(t.entryFee)} <AxmIcon size={12} />
          </span>
        </div>
      )}
    </Link>
  );
}
