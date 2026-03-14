'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Swords, Trophy, Users, Shield, Loader2, CheckCircle, ArrowRight, PartyPopper } from 'lucide-react';
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

interface Props {
  tournament: Tournament;
}

export function TournamentPaywall({ tournament: t }: Props) {
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

  const handleEnterTournament = () => {
    // Force refetch tournament data so hasPaid updates, then page will re-render without paywall
    qc.invalidateQueries({ queryKey: tournamentKeys.detail(t.id) });
    qc.invalidateQueries({ queryKey: tournamentKeys.teams(t.id) });
  };

  // ==================== SUCCESS STATE ====================
  if (t.hasPaid || paid) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-[var(--color-surface)] overflow-hidden animate-fade-up">
        {/* Success hero */}
        <div className="relative bg-gradient-to-br from-emerald-600/20 via-green-500/10 to-teal-600/15 px-6 py-10 text-center overflow-hidden">
          {/* Animated circles */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border border-emerald-500/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-emerald-500/10 animate-ping" style={{ animationDuration: '3s' }} />
          </div>

          <div className="relative">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle size={44} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-emerald-400 mb-2">{tr('tournament.alreadyPaid')}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mx-auto">{title}</p>

            {/* Fee paid badge */}
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-xs font-medium text-emerald-400">
              <PartyPopper size={12} />
              {feeDisplay} AXM
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="p-5 space-y-3">
          <button
            onClick={handleEnterTournament}
            className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-xl font-bold text-base bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98]"
          >
            <Swords size={18} />
            <span>Enter Tournament</span>
            <ArrowRight size={18} />
          </button>

          <p className="text-[10px] text-center text-[var(--color-text-secondary)]">
            {tr('tournament.scoring')} • {tr('tournament.teams')} • {tr('tournament.leaderboard')}
          </p>
        </div>
      </div>
    );
  }

  // ==================== PAYMENT STATE ====================
  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-[var(--color-surface)] overflow-hidden">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-indigo-600/20 to-purple-600/20 px-6 py-8 text-center">
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-5" />
        <Swords size={48} className="text-indigo-400 mx-auto mb-3 relative" />
        <h2 className="text-xl font-bold text-[var(--color-text)] relative">{title}</h2>
        {description && (
          <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-sm mx-auto relative">{description}</p>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Progress */}
        <TournamentProgressBar tournament={t} />

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-3 rounded-xl bg-[var(--color-bg)]">
            <Trophy size={18} className="text-[var(--color-warning)] mx-auto mb-1" />
            <div className="text-sm font-bold text-[var(--color-text)]">{formatAXM(t.totalPrizePool)}</div>
            <div className="text-[10px] text-[var(--color-text-secondary)]">{tr('tournament.prizePool')}</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-bg)]">
            <Users size={18} className="text-indigo-400 mx-auto mb-1" />
            <div className="text-sm font-bold text-[var(--color-text)]">{t.participantCount}</div>
            <div className="text-[10px] text-[var(--color-text-secondary)]">{tr('tournament.participants')}</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--color-bg)]">
            <Shield size={18} className="text-purple-400 mx-auto mb-1" />
            <div className="text-sm font-bold text-[var(--color-text)]">{t.teamCount}</div>
            <div className="text-[10px] text-[var(--color-text-secondary)]">{tr('tournament.teams')}</div>
          </div>
        </div>

        {/* Scoring preview */}
        <div className="rounded-xl bg-[var(--color-bg)] p-3">
          <h4 className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">{tr('tournament.scoring')}</h4>
          <div className="space-y-1">
            {t.scoringConfig.tiers.slice(0, 3).map((tier, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-[var(--color-text-secondary)]">
                  {formatAXM(tier.minAmount)}–{formatAXM(tier.maxAmount)} AXM
                </span>
                <span className="text-[var(--color-text)]">
                  <span className="text-emerald-400">+{tier.winPoints}</span>
                  {' / '}
                  <span className="text-red-400">+{tier.lossPoints}</span>
                </span>
              </div>
            ))}
            {t.scoringConfig.tiers.length > 3 && (
              <div className="text-[10px] text-[var(--color-text-secondary)]">
                +{t.scoringConfig.tiers.length - 3} more tiers...
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>
        )}

        {/* CTA button */}
        <button
          onClick={handlePay}
          disabled={payMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {payMutation.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <span>{tr('tournament.payToEnter')}</span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-xs">
                {feeDisplay} <AxmIcon size={12} />
              </span>
            </>
          )}
        </button>

        <p className="text-[10px] text-center text-[var(--color-text-secondary)]">
          {tr('tournament.entryFee')}: {feeDisplay} AXM • {tr('tournament.commission')}: {t.commissionBps / 100}%
        </p>
      </div>
    </div>
  );
}
