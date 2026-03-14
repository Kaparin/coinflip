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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function TournamentInfoTab({ tournament: t }: { tournament: Tournament }) {
  const { t: tr, locale } = useTranslation();
  const description = pickLocalized(locale, t.description ?? '', t.descriptionEn, t.descriptionRu);

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Description */}
      {description && (
        <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
          <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {/* Scoring rules */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <Target size={16} className="text-indigo-400" />
          {tr('tournament.scoring')}
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)] mb-3">{tr('tournament.scoringRules')}</p>
        <div className="space-y-2">
          {t.scoringConfig.tiers.map((tier, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-bg)]">
              <span className="text-xs text-[var(--color-text-secondary)]">
                {formatAXM(tier.minAmount)} — {formatAXM(tier.maxAmount)} AXM
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-400 font-medium">
                  {tr('tournament.scoringWin').replace('{points}', String(tier.winPoints))}
                </span>
                <span className="text-red-400 font-medium">
                  {tr('tournament.scoringLoss').replace('{points}', String(tier.lossPoints))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prize distribution */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <Trophy size={16} className="text-[var(--color-warning)]" />
          {tr('tournament.prizeDistribution')}
        </h3>
        <div className="space-y-2">
          {t.prizeDistribution.map((entry) => {
            const amount = (BigInt(t.totalPrizePool) * BigInt(Math.round(entry.percent * 100)) / 10000n).toString();
            return (
              <div key={entry.place} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-bg)]">
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    entry.place === 1 ? 'bg-amber-500/20 text-amber-400'
                    : entry.place === 2 ? 'bg-gray-400/20 text-gray-300'
                    : entry.place === 3 ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
                  }`}>
                    {entry.place}
                  </span>
                  <span className="text-xs text-[var(--color-text)]">
                    {tr('tournament.placeN').replace('{n}', String(entry.place))}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--color-text-secondary)]">{entry.percent}% {tr('tournament.ofPool')}</span>
                  <span className="font-semibold text-[var(--color-warning)] flex items-center gap-1">
                    ≈{formatAXM(amount)} <AxmIcon size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--color-text-secondary)] mt-2">{tr('tournament.prizeSentToCaptain')}</p>
      </div>

      {/* Team rules */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <Users size={16} className="text-purple-400" />
          {tr('tournament.teamRules')}
        </h3>
        <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
          <li>• {tr('tournament.teamSizeRule').replace('{min}', String(t.teamConfig.minSize)).replace('{max}', String(t.teamConfig.maxSize))}</li>
          <li>• {tr('tournament.noKickAfterStart')}</li>
          <li>• {tr('tournament.allBetsCount')}</li>
        </ul>
      </div>

      {/* Schedule */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <Clock size={16} className="text-blue-400" />
          Schedule
        </h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-secondary)]">{tr('tournament.registration')}</span>
            <span className="text-[var(--color-text)]">{formatDate(t.registrationStartsAt)} — {formatDate(t.registrationEndsAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-secondary)]">{tr('tournament.active')}</span>
            <span className="text-[var(--color-text)]">{formatDate(t.startsAt)} — {formatDate(t.endsAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
