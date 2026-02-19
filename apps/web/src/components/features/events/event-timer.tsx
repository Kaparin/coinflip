'use client';

import { useState, useEffect } from 'react';

interface EventTimerProps {
  targetDate: string;
  label?: string;
  compact?: boolean;
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function EventTimer({ targetDate, label, compact }: EventTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => new Date(targetDate).getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(new Date(targetDate).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const isExpired = timeLeft <= 0;

  if (compact) {
    return (
      <span className={`tabular-nums font-mono text-xs ${isExpired ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-warning)]'}`}>
        {isExpired ? 'Ended' : formatTimeLeft(timeLeft)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[10px] text-[var(--color-text-secondary)]">{label}</span>}
      <span className={`tabular-nums font-mono text-sm font-bold ${isExpired ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-warning)]'}`}>
        {isExpired ? 'Ended' : formatTimeLeft(timeLeft)}
      </span>
    </div>
  );
}
