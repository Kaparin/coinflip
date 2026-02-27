'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, X, Send, Loader2, CheckCircle } from 'lucide-react';
import { LaunchTokenIcon } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import { useSponsoredRaffleConfig, useSubmitSponsoredRaffle } from '@/hooks/use-sponsored-raffle';
import { formatLaunch, toMicroLaunch } from '@coinflip/shared/constants';

/** Duration preset options in hours */
const DURATION_PRESETS = [
  { hours: 1, label: '1h' },
  { hours: 6, label: '6h' },
  { hours: 12, label: '12h' },
  { hours: 24, label: '1d' },
  { hours: 48, label: '2d' },
  { hours: 72, label: '3d' },
  { hours: 168, label: '7d' },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function getDefaultStartTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface SponsoredRaffleFormProps {
  open: boolean;
  onClose: () => void;
}

export function SponsoredRaffleForm({ open, onClose }: SponsoredRaffleFormProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prizeAmountHuman, setPrizeAmountHuman] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [durationHours, setDurationHours] = useState(24);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const { data: config } = useSponsoredRaffleConfig();
  const submitMutation = useSubmitSponsoredRaffle();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setError(null);
      const id = requestAnimationFrame(() => setVisible(true));
      if (!startsAt) setStartsAt(getDefaultStartTime());
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!config || submitted) return;
    setError(null);

    const prizeNum = Number(prizeAmountHuman);
    if (!prizeNum || prizeNum < 1) {
      setError(t('sponsoredRaffle.errorMinPrize'));
      return;
    }

    const prizeAmountMicro = toMicroLaunch(prizeNum);
    const startDate = new Date(startsAt);
    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    try {
      await submitMutation.mutateAsync({
        title,
        description,
        prizeAmount: prizeAmountMicro,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
      });
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [config, title, description, prizeAmountHuman, startsAt, durationHours, submitted, submitMutation, t]);

  if (!mounted || !open) return null;

  const totalCostMicro = config
    ? BigInt(config.price) + BigInt(toMicroLaunch(Number(prizeAmountHuman) || 0))
    : 0n;

  const canSubmit = title.trim().length >= 3 && description.trim().length >= 3 && Number(prizeAmountHuman) >= 1 && startsAt && !submitMutation.isPending && !submitted;

  return createPortal(
    <div className={`fixed inset-0 z-[70] flex items-end md:items-center justify-center transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className={`relative w-full max-w-md md:rounded-2xl rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl transition-transform duration-200 ${visible ? 'translate-y-0' : 'translate-y-8'} max-h-[85vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15">
              <Trophy size={16} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold">{t('sponsoredRaffle.title')}</h2>
              {config && (
                <p className="text-[10px] text-[var(--color-text-secondary)] flex items-center gap-1">
                  {t('sponsoredRaffle.serviceFee')}: {formatLaunch(config.price)} <LaunchTokenIcon size={24} />
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors">
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-success)]/15">
              <CheckCircle size={28} className="text-[var(--color-success)]" />
            </div>
            <h3 className="text-sm font-bold">{t('sponsoredRaffle.submitted')}</h3>
            <p className="text-xs text-[var(--color-text-secondary)] text-center">{t('sponsoredRaffle.submittedDesc')}</p>
            <button type="button" onClick={handleClose} className="mt-2 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-xs font-bold text-white">
              {t('common.close')}
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Title */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1 block">
                {t('sponsoredRaffle.fieldTitle')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={config?.maxTitle ?? 100}
                placeholder={t('sponsoredRaffle.titlePlaceholder')}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] transition-colors"
              />
              <p className="text-[9px] text-[var(--color-text-secondary)] mt-0.5 text-right">
                {title.length}/{config?.maxTitle ?? 100}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1 block">
                {t('sponsoredRaffle.fieldDescription')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={config?.maxDesc ?? 500}
                rows={3}
                placeholder={t('sponsoredRaffle.descPlaceholder')}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] transition-colors resize-none"
              />
              <p className="text-[9px] text-[var(--color-text-secondary)] mt-0.5 text-right">
                {description.length}/{config?.maxDesc ?? 500}
              </p>
            </div>

            {/* Prize Amount */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1 block">
                {t('sponsoredRaffle.fieldPrize')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={prizeAmountHuman}
                  onChange={(e) => setPrizeAmountHuman(e.target.value)}
                  min={1}
                  placeholder="100"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 pr-16 text-sm outline-none focus:border-[var(--color-primary)] transition-colors"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <LaunchTokenIcon size={28} />
                  <span className="text-[10px] text-[var(--color-text-secondary)]">LAUNCH</span>
                </div>
              </div>
            </div>

            {/* Start time */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1 block">
                {t('sponsoredRaffle.fieldStartTime')}
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>

            {/* Duration presets */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1 block">
                {t('sponsoredRaffle.fieldDuration')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.filter((p) =>
                  (!config || (p.hours >= config.minDurationHours && p.hours <= config.maxDurationHours))
                ).map((p) => (
                  <button
                    key={p.hours}
                    type="button"
                    onClick={() => setDurationHours(p.hours)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      durationHours === p.hours
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/30'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost summary */}
            <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--color-text-secondary)]">{t('sponsoredRaffle.serviceFee')}</span>
                <span className="font-semibold flex items-center gap-1">
                  {config ? formatLaunch(config.price) : '...'} <LaunchTokenIcon size={28} />
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--color-text-secondary)]">{t('sponsoredRaffle.prizePool')}</span>
                <span className="font-semibold flex items-center gap-1">
                  {prizeAmountHuman ? formatLaunch(toMicroLaunch(Number(prizeAmountHuman) || 0)) : '0'} <LaunchTokenIcon size={28} />
                </span>
              </div>
              <div className="border-t border-[var(--color-border)] pt-1.5 flex items-center justify-between text-xs">
                <span className="font-bold">{t('sponsoredRaffle.total')}</span>
                <span className="font-bold text-[var(--color-warning)] flex items-center gap-1">
                  {formatLaunch(totalCostMicro.toString())} <LaunchTokenIcon size={32} />
                </span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 text-sm font-bold text-white transition-all hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {submitMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  {t('common.submitting')}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Send size={14} />
                  {t('sponsoredRaffle.submit')}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
