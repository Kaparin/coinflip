export type SkeletonVariant = 'line' | 'circle' | 'card';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
  /** Width — only applies to 'line' and 'circle' variants */
  width?: string | number;
  /** Height — only applies to 'line' variant */
  height?: string | number;
  /** Diameter — only applies to 'circle' variant */
  size?: string | number;
  /** Number of skeleton lines to render (only for 'line' variant) */
  count?: number;
}

const pulseClass =
  'animate-pulse rounded bg-[var(--color-surface-hover)]';

export function Skeleton({
  variant = 'line',
  className = '',
  width,
  height,
  size,
  count = 1,
}: SkeletonProps) {
  if (variant === 'circle') {
    const d = size ?? 40;
    return (
      <div
        className={['shrink-0 rounded-full', pulseClass, className].join(' ')}
        style={{ width: d, height: d }}
        aria-hidden="true"
      />
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={[
          'rounded-xl border border-[var(--color-border)] p-6',
          pulseClass,
          className,
        ].join(' ')}
        style={{ height: height ?? 160 }}
        aria-hidden="true"
      />
    );
  }

  // variant === 'line'
  if (count > 1) {
    return (
      <div className={['flex flex-col gap-2', className].join(' ')} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={[pulseClass, 'rounded-md'].join(' ')}
            style={{
              width: i === count - 1 ? '60%' : (width ?? '100%'),
              height: height ?? 14,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={[pulseClass, 'rounded-md', className].join(' ')}
      style={{ width: width ?? '100%', height: height ?? 14 }}
      aria-hidden="true"
    />
  );
}
