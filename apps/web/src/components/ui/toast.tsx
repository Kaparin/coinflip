'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Check, X, Info, AlertTriangle } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  exiting?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

/* -------------------------------------------------------------------------- */
/*  Style map                                                                  */
/* -------------------------------------------------------------------------- */

const typeConfig: Record<
  ToastType,
  { icon: ReactNode; border: string; bg: string; text: string; progress: string }
> = {
  success: {
    icon: <Check size={16} strokeWidth={2.5} />,
    border: 'border-l-[var(--color-success)]',
    bg: 'bg-[var(--color-success)]/10',
    text: 'text-[var(--color-success)]',
    progress: 'bg-[var(--color-success)]',
  },
  error: {
    icon: <X size={16} strokeWidth={2.5} />,
    border: 'border-l-[var(--color-danger)]',
    bg: 'bg-[var(--color-danger)]/10',
    text: 'text-[var(--color-danger)]',
    progress: 'bg-[var(--color-danger)]',
  },
  info: {
    icon: <Info size={16} strokeWidth={2.5} />,
    border: 'border-l-[var(--color-primary)]',
    bg: 'bg-[var(--color-primary)]/10',
    text: 'text-[var(--color-primary)]',
    progress: 'bg-[var(--color-primary)]',
  },
  warning: {
    icon: <AlertTriangle size={16} strokeWidth={2.5} />,
    border: 'border-l-[var(--color-warning)]',
    bg: 'bg-[var(--color-warning)]/10',
    text: 'text-[var(--color-warning)]',
    progress: 'bg-[var(--color-warning)]',
  },
};

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

const DISMISS_DELAY = 5000;
const EXIT_DURATION = 200;
const MAX_TOASTS = 3;

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    // Start exit animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    // Remove after exit animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_DURATION);
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string) => {
      const id = `toast-${++counter}`;
      setToasts((prev) => {
        const next = [...prev, { id, type, message }];
        // Keep max N toasts — remove oldest if over limit
        if (next.length > MAX_TOASTS) {
          return next.slice(next.length - MAX_TOASTS);
        }
        return next;
      });
      setTimeout(() => removeToast(id), DISMISS_DELAY);
    },
    [removeToast],
  );

  const value = useMemo(
    () => ({ toasts, addToast, removeToast }),
    [toasts, addToast, removeToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Toast container                                                            */
/* -------------------------------------------------------------------------- */

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 right-4 z-[100] flex flex-col gap-2 md:bottom-4"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Individual toast with progress bar                                         */
/* -------------------------------------------------------------------------- */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const cfg = typeConfig[toast.type];

  return (
    <div
      role="alert"
      className={[
        'relative flex w-80 items-start gap-3 overflow-hidden rounded-xl border border-[var(--color-border)] border-l-4 px-4 py-3',
        'bg-[var(--color-surface)] shadow-lg backdrop-blur-sm',
        toast.exiting ? 'animate-slide-out' : 'animate-slide-in',
        cfg.border,
        cfg.bg,
      ].join(' ')}
    >
      {/* Icon */}
      <span className={['mt-0.5 shrink-0', cfg.text].join(' ')}>
        {cfg.icon}
      </span>

      {/* Message */}
      <p className="flex-1 text-sm text-[var(--color-text)] leading-snug">{toast.message}</p>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>

      {/* Progress bar */}
      {!toast.exiting && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5">
          <div className={['h-full toast-progress opacity-60', cfg.progress].join(' ')} />
        </div>
      )}
    </div>
  );
}
