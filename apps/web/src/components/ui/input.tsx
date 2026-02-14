'use client';

import { type InputHTMLAttributes, forwardRef, useId, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      prefix,
      suffix,
      className = '',
      wrapperClassName = '',
      id: externalId,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = externalId ?? generatedId;

    return (
      <div className={['flex flex-col gap-1.5', wrapperClassName].join(' ')}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--color-text-secondary)]"
          >
            {label}
          </label>
        )}

        <div
          className={[
            'flex items-center rounded-lg border bg-[var(--color-surface)] transition-colors',
            'focus-within:border-[var(--color-primary)] focus-within:ring-1 focus-within:ring-[var(--color-primary)]',
            error
              ? 'border-[var(--color-danger)]'
              : 'border-[var(--color-border)]',
          ].join(' ')}
        >
          {prefix && (
            <span className="flex shrink-0 items-center pl-3 text-sm text-[var(--color-text-secondary)]">
              {prefix}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full bg-transparent px-3 py-2 text-sm text-[var(--color-text)]',
              'placeholder:text-[var(--color-text-secondary)]/50',
              'outline-none',
              prefix ? 'pl-1.5' : '',
              suffix ? 'pr-1.5' : '',
              className,
            ].join(' ')}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />

          {suffix && (
            <span className="flex shrink-0 items-center pr-3 text-sm text-[var(--color-text-secondary)]">
              {suffix}
            </span>
          )}
        </div>

        {error && (
          <p
            id={`${inputId}-error`}
            className="text-xs text-[var(--color-danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
