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
  /** Close when clicking on the overlay background. Default true. Set false for forms to prevent accidental data loss. */
  closeOnOverlayClick?: boolean;
  children: ReactNode;
}

function useVisualViewportStyles(open: boolean) {
  const [styles, setStyles] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.visualViewport) return;

    const vv = window.visualViewport;

    const applyViewport = () => {
      if (vv.height < window.innerHeight * 0.95) {
        setStyles({
          height: `${vv.height}px`,
          width: `${vv.width}px`,
          top: `${vv.offsetTop}px`,
          left: `${vv.offsetLeft}px`,
        });
      } else {
        setStyles({});
      }
    };

    applyViewport();
    vv.addEventListener('resize', applyViewport);
    vv.addEventListener('scroll', applyViewport);
    return () => {
      vv.removeEventListener('resize', applyViewport);
      vv.removeEventListener('scroll', applyViewport);
      setStyles({});
    };
  }, [open]);

  return styles;
}

export function Modal({
  open,
  onClose,
  title,
  showCloseButton = true,
  showCloseButtonBottom = false,
  closeOnOverlayClick = true,
  children,
}: ModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const viewportStyles = useVisualViewportStyles(open);
  const historyPushedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
  // Note: onClose in deps would cause effect to re-run on parent re-render (e.g. when user
  // clicks 25% in withdraw modal), triggering cleanup → history.back() → popstate → close.
  // We use onCloseRef so effect only runs when `open` changes.
  useEffect(() => {
    if (!open) return;
    historyPushedRef.current = true;
    history.pushState({ modal: true }, '');
    const handlePopState = () => {
      historyPushedRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (historyPushedRef.current) {
        history.back();
        historyPushedRef.current = false;
      }
    };
  }, [open]);

  const showCloseButtonRef = useRef(showCloseButton);
  showCloseButtonRef.current = showCloseButton;

  // Escape key handler (only when closable) — use refs to avoid effect re-runs on parent re-render
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCloseButtonRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  const canClose = showCloseButton;
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (canClose && closeOnOverlayClick && e.target === overlayRef.current) onCloseRef.current();
    },
    [canClose, closeOnOverlayClick],
  );
  const handleCloseClick = useCallback(() => onCloseRef.current(), []);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? t('common.close')}
      onClick={handleOverlayClick}
      style={viewportStyles}
      className={[
        'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4',
        'bg-black/60 backdrop-blur-sm',
        'transition-[opacity,height,top] duration-200 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={[
          'w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-[var(--color-border)]',
          'bg-[var(--color-surface)] shadow-2xl flex flex-col overflow-hidden',
          'transition-all duration-200',
          // Fallback max-h for browsers without dvh support
          Object.keys(viewportStyles).length > 0 ? 'max-h-[90%]' : 'max-h-[85vh] sm:max-h-[85vh]',
          visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4 sm:translate-y-0',
        ].join(' ')}
        // dvh accounts for mobile browser chrome (URL bar); overrides class if supported
        style={Object.keys(viewportStyles).length === 0 ? { maxHeight: '88dvh' } : undefined}
      >
        {/* Header: title + close button — compact on mobile */}
        <div className="flex items-center justify-between shrink-0 border-b border-[var(--color-border)] px-3 sm:px-6 py-2 sm:py-3">
          {title ? (
            <h2 className="text-base sm:text-lg font-semibold text-[var(--color-text)]">{title}</h2>
          ) : (
            <span />
          )}
          {canClose && (
            <button
              type="button"
              onClick={handleCloseClick}
              className="-mr-1 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-95 cursor-pointer touch-manipulation"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body: scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-6 py-3 sm:py-4 min-h-0">
          {children}
        </div>

        {/* Optional bottom close button */}
        {showCloseButtonBottom && canClose && (
          <div className="shrink-0 border-t border-[var(--color-border)] px-3 sm:px-6 py-2 sm:py-3">
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
