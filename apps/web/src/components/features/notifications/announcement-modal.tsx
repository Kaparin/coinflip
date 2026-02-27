'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, AlertTriangle, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface AnnouncementModalProps {
  open: boolean;
  onDismiss: () => void;
  title: string;
  message: string;
  priority: 'normal' | 'important';
}

export function AnnouncementModal({ open, onDismiss, title, message, priority }: AnnouncementModalProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();

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

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  if (!mounted || !open) return null;

  const isImportant = priority === 'important';
  const accentColor = isImportant ? 'amber' : 'indigo';
  const Icon = isImportant ? AlertTriangle : Megaphone;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={handleDismiss}
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl border bg-[var(--color-surface)] shadow-2xl transition-all duration-300 ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } ${
          isImportant ? 'border-amber-500/30' : 'border-[var(--color-border)]'
        }`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
        >
          <X size={16} />
        </button>

        <div className="p-5 text-center space-y-4">
          {/* Icon */}
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            isImportant ? 'bg-amber-500/15' : 'bg-[var(--color-primary)]/15'
          }`}>
            <Icon size={28} className={isImportant ? 'text-amber-400' : 'text-[var(--color-primary)]'} />
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold">{title}</h3>

          {/* Message */}
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
            {message}
          </p>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={handleDismiss}
            className={`w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98] ${
              isImportant
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/20'
                : 'bg-gradient-to-r from-[var(--color-primary)] to-indigo-600 shadow-lg shadow-[var(--color-primary)]/20'
            }`}
          >
            {t('common.ok')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
