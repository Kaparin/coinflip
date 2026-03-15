'use client';

import { Trophy, Target, Clock, Users } from 'lucide-react';
import { useTranslation, pickLocalized } from '@/lib/i18n';
import { AxmIcon } from '@/components/ui/axm-icon';
import type { Tournament } from '@/hooks/use-tournaments';

function formatAXM(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function TournamentInfoTab({ tournament: t }: { tournament: Tournament }) {
  const { t: tr, locale } = useTranslation();
  const description = pickLocalized(locale, t.description ?? '', t.descriptionEn, t.descriptionRu);

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Description */}
      {description && (
        <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">{description}</p>
        </div>
      )}

      {/* Scoring rules */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 sm:p-4">
        <h3 className="text-xs sm:text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-1.5">
          <Target size={14} className="text-indigo-400" />
          {tr('tournament.scoring')}
        </h3>
        <p className="text-[10px] sm:text-xs text-[var(--color-text-secondary)] mb-2">{tr('tournament.scoringRules')}</p>
        <div className="space-y-1">
          {t.scoringConfig.tiers.map((tier, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg)] gap-2">
              <span className="text-[10px] sm:text-xs text-[var(--color-text-secondary)] truncate">
                {formatAXM(tier.minAmount)}–{formatAXM(tier.maxAmount)} AXM
              </span>
              <div className="flex items-center gap-2 text-[10px] sm:text-xs shrink-0">
                <span className="text-emerald-400 font-medium">+{tier.winPoints}</span>
                <span className="text-[var(--color-text-secondary)]">/</span>
                <span className="text-red-400 font-medium">+{tier.lossPoints}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prize distribution */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 sm:p-4">
        <h3 className="text-xs sm:text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-1.5">
          <Trophy size={14} className="text-[var(--color-warning)]" />
          {tr('tournament.prizeDistribution')}
        </h3>
        <div className="space-y-1">
          {t.prizeDistribution.map((entry) => {
            const amount = (BigInt(t.totalPrizePool) * BigInt(Math.round(entry.percent * 100)) / 10000n).toString();
            const medals = ['🥇', '🥈', '🥉'];
            return (
              <div key={entry.place} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg)] gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{medals[entry.place - 1] ?? `#${entry.place}`}</span>
                  <span className="text-[10px] sm:text-xs text-[var(--color-text)]">
                    {tr('tournament.placeN').replace('{n}', String(entry.place))}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs shrink-0">
                  <span className="text-[var(--color-text-secondary)]">{entry.percent}%</span>
                  <span className="font-semibold text-[var(--color-warning)] flex items-center gap-0.5">
                    ≈{formatAXM(amount)} <AxmIcon size={10} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] sm:text-[10px] text-[var(--color-text-secondary)] mt-2">{tr('tournament.prizeSentToCaptain')}</p>
      </div>

      {/* Team rules */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 sm:p-4">
        <h3 className="text-xs sm:text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-1.5">
          <Users size={14} className="text-purple-400" />
          {tr('tournament.teamRules')}
        </h3>
        <ul className="space-y-1 text-[10px] sm:text-xs text-[var(--color-text-secondary)]">
          <li>• {tr('tournament.teamSizeRule').replace('{min}', String(t.teamConfig.minSize)).replace('{max}', String(t.teamConfig.maxSize))}</li>
          <li>• {tr('tournament.noKickAfterStart')}</li>
          <li>• {tr('tournament.allBetsCount')}</li>
        </ul>
      </div>

      {/* Schedule */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 sm:p-4">
        <h3 className="text-xs sm:text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-1.5">
          <Clock size={14} className="text-blue-400" />
          {tr('tournament.rules')}
        </h3>
        <div className="space-y-1.5 text-[10px] sm:text-xs">
          <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
            <span className="text-[var(--color-text-secondary)]">{tr('tournament.registration')}</span>
            <span className="text-[var(--color-text)] font-mono text-[9px] sm:text-[10px]">
              {formatDate(t.registrationStartsAt, locale)} — {formatDate(t.registrationEndsAt, locale)}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
            <span className="text-[var(--color-text-secondary)]">{tr('tournament.active')}</span>
            <span className="text-[var(--color-text)] font-mono text-[9px] sm:text-[10px]">
              {formatDate(t.startsAt, locale)} — {formatDate(t.endsAt, locale)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
