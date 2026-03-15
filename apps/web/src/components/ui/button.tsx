'use client';

import { type ButtonHTMLAttributes, type MouseEvent, forwardRef, useCallback, useRef } from 'react';

// ---- Variant styles ----
const variantClasses = {
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] focus-visible:ring-[var(--color-primary)] btn-glow-primary',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] focus-visible:ring-[var(--color-border)]',
  danger:
    'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]/90 focus-visible:ring-[var(--color-danger)] btn-glow-danger',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-500 btn-glow-success',
  warning:
    'bg-amber-600 text-white hover:bg-amber-500 focus-visible:ring-amber-500 btn-glow-warning',
  ghost:
    'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:ring-[var(--color-border)]',
} as const;

const sizeClasses = {
  xs: 'px-2.5 py-1 text-xs rounded-md gap-1',
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-6 py-3 text-base rounded-xl gap-2.5',
} as const;

export type ButtonVariant = keyof typeof variantClasses;
export type ButtonSize = keyof typeof sizeClasses;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Success state — shows check icon briefly */
  success?: boolean;
}

// ---- Pulsing dots loader ----
function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      <span className="btn-dot" />
      <span className="btn-dot" />
      <span className="btn-dot" />
    </span>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      success = false,
      disabled,
      className = '',
      children,
      onClick,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    const btnRef = useRef<HTMLButtonElement | null>(null);

    // Ripple effect — set CSS custom properties at click position
    const handleClick = useCallback(
      (e: MouseEvent<HTMLButtonElement>) => {
        const el = btnRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          el.style.setProperty('--ripple-x', `${x}%`);
          el.style.setProperty('--ripple-y', `${y}%`);
        }
        onClick?.(e);
      },
      [onClick],
    );

    // Merge refs
    const setRef = useCallback(
      (node: HTMLButtonElement | null) => {
        btnRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    return (
      <button
        ref={setRef}
        disabled={isDisabled}
        onClick={handleClick}
        className={[
          'inline-flex items-center justify-center font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer select-none',
          // Animation classes
          'btn-ripple btn-glow btn-spring',
          loading ? 'btn-loading-shimmer' : '',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <LoadingDots />
        ) : success ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-scale-up">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          children
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
