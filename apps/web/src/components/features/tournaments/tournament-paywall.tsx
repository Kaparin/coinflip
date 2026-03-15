'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Swords, Trophy, Users, Shield, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation, pickLocalized } from '@/lib/i18n';
import { usePayEntryFee, tournamentKeys } from '@/hooks/use-tournaments';
import { AxmIcon } from '@/components/ui/axm-icon';
import { TournamentProgressBar } from './tournament-progress-bar';
import type { Tournament } from '@/hooks/use-tournaments';

function formatAXM(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function TournamentPaywall({ tournament: t }: { tournament: Tournament }) {
  const { t: tr, locale } = useTranslation();
  const qc = useQueryClient();
  const payMutation = usePayEntryFee();
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const title = pickLocalized(locale, t.title, t.titleEn, t.titleRu);
  const description = pickLocalized(locale, t.description ?? '', t.descriptionEn, t.descriptionRu);
  const feeDisplay = formatAXM(t.entryFee);

  const handlePay = async () => {
    setError(null);
    try {
      await payMutation.mutateAsync(t.id);
      setPaid(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    }
  };

  const handleEnter = () => {
    qc.invalidateQueries({ queryKey: tournamentKeys.detail(t.id) });
    qc.invalidateQueries({ queryKey: tournamentKeys.teams(t.id) });
  };

  // ===== SUCCESS =====
  if (t.hasPaid || paid) {
    return (
      <div className="rounded-xl sm:rounded-2xl border border-emerald-500/25 bg-[var(--color-surface)] overflow-hidden animate-fade-up">
        <div className="relative bg-gradient-to-br from-emerald-600/15 to-green-500/10 px-4 py-8 sm:py-10 text-center overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-emerald-500/15 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border border-emerald-500/10 animate-ping" style={{ animationDuration: '3s' }} />
          </div>
          <div className="relative">
            <CheckCircle size={44} className="text-emerald-400 mx-auto mb-3" />
            <h2 className="text-base sm:text-lg font-bold text-emerald-400">{tr('tournament.alreadyPaid')}</h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{title}</p>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <Button variant="success" size="lg" onClick={handleEnter} className="w-full">
            <Swords size={16} />
            <span>{tr('tournament.joinTeam')}</span>
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    );
  }

  // ===== PAYMENT =====
  return (
    <div className="rounded-xl sm:rounded-2xl border border-indigo-500/25 bg-[var(--color-surface)] overflow-hidden">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-indigo-600/15 to-purple-600/15 px-4 sm:px-6 py-6 sm:py-8 text-center">
        <Swords size={40} className="text-indigo-400 mx-auto mb-2 relative" />
        <h2 className="text-base sm:text-xl font-bold text-[var(--color-text)] relative">{title}</h2>
        {description && (
          <p className="text-[11px] sm:text-sm text-[var(--color-text-secondary)] mt-1.5 max-w-sm mx-auto relative">{description}</p>
        )}
      </div>

      <div className="p-3 sm:p-5 space-y-3">
        <TournamentProgressBar tournament={t} />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="p-2 sm:p-3 rounded-xl bg-[var(--color-bg)] text-center">
            <Trophy size={16} className="text-[var(--color-warning)] mx-auto mb-0.5" />
            <div className="text-xs sm:text-sm font-bold text-[var(--color-text)]">{formatAXM(t.totalPrizePool)}</div>
            <div className="text-[8px] sm:text-[10px] text-[var(--color-text-secondary)]">{tr('tournament.prizePool')}</div>
          </div>
          <div className="p-2 sm:p-3 rounded-xl bg-[var(--color-bg)] text-center">
            <Users size={16} className="text-indigo-400 mx-auto mb-0.5" />
            <div className="text-xs sm:text-sm font-bold text-[var(--color-text)]">{t.participantCount}</div>
            <div className="text-[8px] sm:text-[10px] text-[var(--color-text-secondary)]">{tr('tournament.participants')}</div>
          </div>
          <div className="p-2 sm:p-3 rounded-xl bg-[var(--color-bg)] text-center">
            <Shield size={16} className="text-purple-400 mx-auto mb-0.5" />
            <div className="text-xs sm:text-sm font-bold text-[var(--color-text)]">{t.teamCount}</div>
            <div className="text-[8px] sm:text-[10px] text-[var(--color-text-secondary)]">{tr('tournament.teams')}</div>
          </div>
        </div>

        {/* Scoring preview */}
        <div className="rounded-xl bg-[var(--color-bg)] p-2.5 sm:p-3">
          <h4 className="text-[10px] sm:text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">{tr('tournament.scoring')}</h4>
          <div className="space-y-0.5">
            {t.scoringConfig.tiers.slice(0, 3).map((tier, i) => (
              <div key={i} className="flex justify-between text-[10px] sm:text-xs py-0.5">
                <span className="text-[var(--color-text-secondary)]">{formatAXM(tier.minAmount)}–{formatAXM(tier.maxAmount)}</span>
                <span>
                  <span className="text-emerald-400">+{tier.winPoints}</span>
                  <span className="text-[var(--color-text-secondary)]"> / </span>
                  <span className="text-red-400">+{tier.lossPoints}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-400">{error}</div>
        )}

        {/* Hide pay button if registration has ended */}
        {new Date(t.registrationEndsAt) < new Date() ? (
          <div className="w-full py-3 rounded-xl text-center text-sm font-medium bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
            {tr('tournament.registrationClosed')}
          </div>
        ) : (
          <Button variant="primary" size="lg" onClick={handlePay} loading={payMutation.isPending} className="w-full">
            <span>{tr('tournament.payToEnter')}</span>
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-white/20 text-[11px]">
              {feeDisplay} <AxmIcon size={11} />
            </span>
          </Button>
        )}

        <p className="text-[9px] text-center text-[var(--color-text-secondary)]">
          {tr('tournament.entryFee')}: {feeDisplay} AXM • {tr('tournament.commission')}: {t.commissionBps / 100}%
        </p>
      </div>
    </div>
  );
}
