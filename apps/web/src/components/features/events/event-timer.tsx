'use client';

import { useState, useEffect } from 'react';

interface EventTimerProps {
  targetDate: string;
  label?: string;
  compact?: boolean;
  eventType?: string;
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

const ONE_HOUR = 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

export function EventTimer({ targetDate, label, compact, eventType }: EventTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => new Date(targetDate).getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(new Date(targetDate).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const isExpired = timeLeft <= 0;
  const isUrgent = !isExpired && timeLeft < ONE_HOUR;
  const isCritical = !isExpired && timeLeft < FIVE_MINUTES;

  // Color based on urgency or event type
  const getColor = () => {
    if (isExpired) return 'text-[var(--color-text-secondary)]';
    if (isUrgent) return 'text-[var(--color-danger)]';
    if (eventType === 'contest') return 'text-indigo-400';
    if (eventType === 'raffle') return 'text-amber-400';
    return 'text-[var(--color-warning)]';
  };

  const colorClass = getColor();

  if (compact) {
    return (
      <span className={`tabular-nums font-mono text-xs ${colorClass} ${isUrgent ? 'animate-urgency-pulse' : ''}`}>
        {isExpired ? 'Ended' : formatTimeLeft(timeLeft)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[10px] text-[var(--color-text-secondary)]">{label}</span>}
      {isCritical && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-danger)] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-danger)]" />
        </span>
      )}
      <span className={`tabular-nums font-mono text-sm font-bold ${colorClass} ${isUrgent ? 'animate-urgency-pulse' : ''}`}>
        {isExpired ? 'Ended' : formatTimeLeft(timeLeft)}
      </span>
    </div>
  );
}
