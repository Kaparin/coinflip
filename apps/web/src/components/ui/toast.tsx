'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

/* -------------------------------------------------------------------------- */
/*  Style map                                                                  */
/* -------------------------------------------------------------------------- */

const typeStyles: Record<ToastType, { icon: string; border: string; bg: string }> = {
  success: {
    icon: '✓',
    border: 'border-l-[var(--color-success)]',
    bg: 'bg-[var(--color-success)]/10',
  },
  error: {
    icon: '✕',
    border: 'border-l-[var(--color-danger)]',
    bg: 'bg-[var(--color-danger)]/10',
  },
  info: {
    icon: 'ℹ',
    border: 'border-l-[var(--color-primary)]',
    bg: 'bg-[var(--color-primary)]/10',
  },
  warning: {
    icon: '⚠',
    border: 'border-l-[var(--color-warning)]',
    bg: 'bg-[var(--color-warning)]/10',
  },
};

const typeTextColors: Record<ToastType, string> = {
  success: 'text-[var(--color-success)]',
  error: 'text-[var(--color-danger)]',
  info: 'text-[var(--color-primary)]',
  warning: 'text-[var(--color-warning)]',
};

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string) => {
      const id = `toast-${++counter}`;
      setToasts((prev) => [...prev, { id, type, message }]);

      // Auto-dismiss after 5 seconds
      setTimeout(() => removeToast(id), 5000);
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
/*  Toast container (bottom-right, stacked)                                    */
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
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Individual toast                                                           */
/* -------------------------------------------------------------------------- */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const style = typeStyles[toast.type];
  const textColor = typeTextColors[toast.type];

  return (
    <div
      role="alert"
      className={[
        'flex w-80 items-start gap-3 rounded-lg border border-[var(--color-border)] border-l-4 px-4 py-3',
        'bg-[var(--color-surface)] shadow-lg',
        'animate-[slideIn_200ms_ease-out]',
        style.border,
        style.bg,
      ].join(' ')}
    >
      <span className={['mt-0.5 text-sm font-bold', textColor].join(' ')}>
        {style.icon}
      </span>
      <p className="flex-1 text-sm text-[var(--color-text)]">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] cursor-pointer"
        aria-label="Dismiss notification"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
