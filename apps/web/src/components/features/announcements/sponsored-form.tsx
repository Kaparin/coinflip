'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, X, Send, Loader2, CheckCircle, Clock, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useSponsoredConfig, useSubmitSponsored } from '@/hooks/use-sponsored';
import { formatLaunch } from '@coinflip/shared/constants';

interface SponsoredFormProps {
  open: boolean;
  onClose: () => void;
}

export function SponsoredForm({ open, onClose }: SponsoredFormProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const { data: config } = useSponsoredConfig();
  const submitMutation = useSubmitSponsored();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setError(null);
      const id = requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = 'hidden';
      return () => { cancelAnimationFrame(id); document.body.style.overflow = ''; };
    }
    setVisible(false);
    document.body.style.overflow = '';
  }, [open]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      onClose();
      // Reset form after close animation
      setTitle('');
      setMessage('');
      setSubmitted(false);
      setError(null);
    }, 200);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim()) return;
    setError(null);
    try {
      await submitMutation.mutateAsync({ title: title.trim(), message: message.trim() });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    }
  };

  if (!mounted || !open) return null;

  const maxTitle = config?.maxTitle ?? 200;
  const maxMessage = config?.maxMessage ?? 1000;
  const price = config?.price ?? '0';
  const isActive = config?.isActive ?? false;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
      className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-teal-500/30 bg-[var(--color-surface)] shadow-2xl transition-all duration-300 max-h-[90vh] overflow-y-auto ${
          visible ? 'translate-y-0 sm:scale-100 opacity-100' : 'translate-y-full sm:translate-y-0 sm:scale-95 opacity-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/15">
              <Megaphone size={18} className="text-teal-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{t('sponsored.title')}</h3>
              <p className="text-[10px] text-[var(--color-text-secondary)]">
                {t('sponsored.price')}: {formatLaunch(price)} LAUNCH
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5">
          {/* Disabled state */}
          {!isActive ? (
            <div className="rounded-lg bg-amber-500/10 px-3 py-3 text-xs text-amber-400 text-center">
              {t('sponsored.disabled')}
            </div>
          ) : submitted ? (
            /* Success state — full screen with info */
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
                  <CheckCircle size={28} className="text-green-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-green-400">{t('sponsored.successTitle')}</h4>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    {t('sponsored.successDesc')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
                  <Clock size={14} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                    {t('sponsored.successStep1')}
                  </p>
                </div>
                <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
                  <ShieldCheck size={14} className="text-teal-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                    {t('sponsored.successStep2')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl border border-[var(--color-border)] py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                {t('sponsored.close')}
              </button>
            </div>
          ) : (
            /* Form state */
            <div className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('sponsored.titleLabel')}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('sponsored.titlePlaceholder')}
                  maxLength={maxTitle}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
                <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 text-right">{title.length}/{maxTitle}</p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('sponsored.messageLabel')}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('sponsored.messagePlaceholder')}
                  maxLength={maxMessage}
                  rows={4}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:border-teal-500 focus:outline-none resize-none"
                />
                <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 text-right">{message.length}/{maxMessage}</p>
              </div>

              <div className="rounded-lg bg-teal-500/5 border border-teal-500/20 px-3 py-2.5 text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                {t('sponsored.notice')}
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 text-center">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitMutation.isPending || !title.trim() || !message.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {submitMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {t('sponsored.submit')} ({formatLaunch(price)} LAUNCH)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
