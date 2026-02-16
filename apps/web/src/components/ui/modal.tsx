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

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Mount portal target
  useEffect(() => {
    setMounted(true);
  }, []);

  // Animate in/out
  useEffect(() => {
    if (open) {
      // Request animation frame to trigger CSS transition after mount
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
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

  // Click outside handler
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={handleOverlayClick}
      className={[
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black/60 backdrop-blur-sm',
        'transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        className={[
          'w-full max-w-lg rounded-xl border border-[var(--color-border)]',
          'bg-[var(--color-surface)] shadow-2xl',
          'transition-all duration-200',
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
        ].join(' ')}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] cursor-pointer"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
