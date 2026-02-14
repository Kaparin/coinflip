import { useState, useEffect } from 'react';

export interface BetCardProps {
  id: string;
  maker: string;
  amount: number;
  side: 'heads' | 'tails';
  createdAt: Date;
  /** If the bet has been accepted, this is the reveal deadline */
  revealDeadline?: Date;
  /** Whether the current user can accept this bet */
  canAccept?: boolean;
  onAccept?: (id: string) => void;
}

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CountdownTimer({ deadline }: { deadline: Date }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => {
      const next = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, remaining]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isUrgent = remaining <= 60;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${
        isUrgent
          ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
          : 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
      }`}
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
        />
      </svg>
      {minutes}:{seconds.toString().padStart(2, '0')}
    </div>
  );
}

export function BetCard({
  id,
  maker,
  amount,
  side,
  createdAt,
  revealDeadline,
  canAccept = true,
  onAccept,
}: BetCardProps) {
  const isHighValue = amount >= 500;

  return (
    <div
      className={`group relative rounded-2xl border bg-[var(--color-surface)] p-5 transition-all hover:bg-[var(--color-surface-hover)] ${
        isHighValue
          ? 'border-[var(--color-warning)]/40 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
          : 'border-[var(--color-border)]'
      }`}
    >
      {/* High-value badge */}
      {isHighValue && (
        <div className="absolute -top-2.5 right-4 rounded-full bg-[var(--color-warning)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
          High Stake
        </div>
      )}

      {/* Header: side + time */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{side === 'heads' ? '👑' : '🪙'}</span>
          <span className="text-sm font-semibold capitalize text-[var(--color-text)]">
            {side}
          </span>
        </div>
        {revealDeadline ? (
          <CountdownTimer deadline={revealDeadline} />
        ) : (
          <span className="text-xs text-[var(--color-text-secondary)]">
            {timeAgo(createdAt)}
          </span>
        )}
      </div>

      {/* Amount */}
      <div className="mb-3">
        <span className="text-2xl font-bold tabular-nums text-[var(--color-text)]">
          {amount.toLocaleString()}
        </span>
        <span className="ml-1.5 text-sm text-[var(--color-text-secondary)]">LAUNCH</span>
      </div>

      {/* Maker */}
      <div className="mb-4 text-xs text-[var(--color-text-secondary)]">
        by{' '}
        <span className="font-mono text-[var(--color-text)]">
          {truncateAddress(maker)}
        </span>
      </div>

      {/* Accept Button */}
      {!revealDeadline && (
        <button
          type="button"
          disabled={!canAccept}
          onClick={() => onAccept?.(id)}
          className="w-full rounded-xl bg-[var(--color-success)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-success)]/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Accept &amp; Flip
        </button>
      )}

      {revealDeadline && (
        <div className="rounded-xl bg-[var(--color-bg)] px-4 py-2.5 text-center text-sm font-medium text-[var(--color-text-secondary)]">
          Waiting for reveal...
        </div>
      )}
    </div>
  );
}
