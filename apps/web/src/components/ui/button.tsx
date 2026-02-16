'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const variantClasses = {
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] focus-visible:ring-[var(--color-primary)]',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] focus-visible:ring-[var(--color-border)]',
  danger:
    'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]/90 focus-visible:ring-[var(--color-danger)]',
  ghost:
    'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:ring-[var(--color-border)]',
} as const;

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-6 py-3 text-base rounded-lg gap-2.5',
} as const;

export type ButtonVariant = keyof typeof variantClasses;
export type ButtonSize = keyof typeof sizeClasses;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" aria-hidden="true" />;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-medium transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading && <Spinner size={size === 'sm' ? 14 : 16} />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
