export type BetStatus =
  | 'open'
  | 'accepted'
  | 'revealed'
  | 'canceled'
  | 'timeout_claimed';

const statusConfig: Record<
  BetStatus,
  { label: string; classes: string }
> = {
  open: {
    label: 'Open',
    classes: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)] ring-[var(--color-warning)]/30',
  },
  accepted: {
    label: 'Accepted',
    classes: 'bg-[#3b82f6]/15 text-[#3b82f6] ring-[#3b82f6]/30',
  },
  revealed: {
    label: 'Revealed',
    classes: 'bg-[var(--color-success)]/15 text-[var(--color-success)] ring-[var(--color-success)]/30',
  },
  canceled: {
    label: 'Canceled',
    classes: 'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)] ring-[var(--color-text-secondary)]/30',
  },
  timeout_claimed: {
    label: 'Timeout',
    classes: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)] ring-[var(--color-danger)]/30',
  },
};

export interface BadgeProps {
  status: BetStatus;
  className?: string;
}

export function Badge({ status, className = '' }: BadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        config.classes,
        className,
      ].join(' ')}
    >
      {config.label}
    </span>
  );
}
