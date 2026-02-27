'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, X, Send, Loader2 } from 'lucide-react';
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
  const [result, setResult] = useState<string | null>(null);
  const { t } = useTranslation();

  const { data: config } = useSponsoredConfig();
  const submitMutation = useSubmitSponsored();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      document.body.style.overflow = 'hidden';
      return () => { cancelAnimationFrame(id); document.body.style.overflow = ''; };
    }
    setVisible(false);
    document.body.style.overflow = '';
  }, [open]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim()) return;
    setResult(null);
    try {
      await submitMutation.mutateAsync({ title: title.trim(), message: message.trim() });
      setResult('success');
      setTitle('');
      setMessage('');
      setTimeout(handleClose, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setResult(msg);
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
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl border border-teal-500/30 bg-[var(--color-surface)] shadow-2xl transition-all duration-300 ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500/15">
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

        <div className="px-5 pb-5 space-y-4">
          {!isActive ? (
            <div className="rounded-lg bg-amber-500/10 px-3 py-3 text-xs text-amber-400 text-center">
              {t('sponsored.disabled')}
            </div>
          ) : (
            <>
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

              <div className="rounded-lg bg-teal-500/5 border border-teal-500/20 px-3 py-2 text-[11px] text-[var(--color-text-secondary)]">
                {t('sponsored.notice')}
              </div>

              {result === 'success' ? (
                <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-400 text-center">
                  {t('sponsored.success')}
                </div>
              ) : result ? (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 text-center">
                  {result}
                </div>
              ) : null}

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
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
