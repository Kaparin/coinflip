'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Show close button (X) and allow overlay/back to close. Default true. Set false when modal cannot be closed (e.g. during signing). */
  showCloseButton?: boolean;
  /** Show "Close" button at bottom. Default false. */
  showCloseButtonBottom?: boolean;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  showCloseButton = true,
  showCloseButtonBottom = false,
  children,
}: ModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const historyPushedRef = useRef(false);

  // Mount portal target
  useEffect(() => {
    setMounted(true);
  }, []);

  // Animate in/out
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  // Android back button: push state when opening, listen to popstate
  useEffect(() => {
    if (!open) return;
    historyPushedRef.current = true;
    history.pushState({ modal: true }, '');
    const handlePopState = () => {
      historyPushedRef.current = false; // Back already popped our state
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (historyPushedRef.current) {
        history.back(); // Pop our state when closed by X/overlay
        historyPushedRef.current = false;
      }
    };
  }, [open, onClose]);

  // Escape key handler (only when closable)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCloseButton) onClose();
    },
    [onClose, showCloseButton],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [open, handleKeyDown]);

  const canClose = showCloseButton;
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (canClose && e.target === overlayRef.current) onClose();
    },
    [onClose, canClose],
  );
  const handleCloseClick = useCallback(() => onClose(), [onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? t('common.close')}
      onClick={handleOverlayClick}
      className={[
        'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4',
        'bg-black/60 backdrop-blur-sm',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={[
          'w-full max-h-[90vh] sm:max-h-[85vh] sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-[var(--color-border)]',
          'bg-[var(--color-surface)] shadow-2xl flex flex-col',
          'transition-all duration-200',
          visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4 sm:translate-y-0',
        ].join(' ')}
      >
        {/* Header: title + close button */}
        <div className="flex items-center justify-between shrink-0 border-b border-[var(--color-border)] px-4 sm:px-6 py-3">
          {title ? (
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
          ) : (
            <span />
          )}
          {canClose && (
            <button
              type="button"
              onClick={handleCloseClick}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-95 cursor-pointer"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Body: scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 min-h-0">
          {children}
        </div>

        {/* Optional bottom close button */}
        {showCloseButtonBottom && canClose && (
          <div className="shrink-0 border-t border-[var(--color-border)] px-4 sm:px-6 py-3">
            <button
              type="button"
              onClick={handleCloseClick}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm font-bold transition-colors hover:bg-[var(--color-surface-hover)] active:scale-[0.98]"
            >
              {t('common.close')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
