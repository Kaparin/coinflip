import { type ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
}

export interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={[
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]',
        'overflow-hidden',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div
      className={[
        'border-b border-[var(--color-border)] px-6 py-4',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardContent({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={['px-6 py-4', className].join(' ')}>{children}</div>;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div
      className={[
        'border-t border-[var(--color-border)] px-6 py-4',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
