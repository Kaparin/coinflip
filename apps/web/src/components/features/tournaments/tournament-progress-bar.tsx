'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import type { Tournament } from '@/hooks/use-tournaments';

interface Props {
  tournament: Tournament;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TournamentProgressBar({ tournament: t }: Props) {
  const { t: tr } = useTranslation();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const regStart = new Date(t.registrationStartsAt).getTime();
  const regEnd = new Date(t.registrationEndsAt).getTime();
  const start = new Date(t.startsAt).getTime();
  const end = new Date(t.endsAt).getTime();

  // Determine phase and progress
  let label = '';
  let countdown = '';
  let progress = 0;
  let barColor = 'bg-indigo-500';
  let urgentPulse = false;

  if (t.status === 'registration') {
    if (now < regEnd) {
      const total = regEnd - regStart;
      const elapsed = now - regStart;
      progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
      const remaining = regEnd - now;
      countdown = formatCountdown(remaining);
      label = tr('tournament.registrationEndsIn');
      barColor = 'bg-indigo-500';
      if (remaining < 3600_000) urgentPulse = true;
    } else {
      progress = 100;
      label = tr('tournament.registrationClosed');
      barColor = 'bg-gray-500';
    }
  } else if (t.status === 'active') {
    const total = end - start;
    const elapsed = now - start;
    progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
    const remaining = end - now;
    countdown = formatCountdown(remaining);
    label = tr('tournament.tournamentEndsIn');
    barColor = 'bg-emerald-500';
    if (remaining < 86400_000) barColor = 'bg-amber-500'; // last day
    if (remaining < 3600_000) { barColor = 'bg-red-500'; urgentPulse = true; }
  } else if (t.status === 'draft') {
    const remaining = regStart - now;
    if (remaining > 0) {
      countdown = formatCountdown(remaining);
      label = tr('tournament.tournamentStartsIn');
      progress = 0;
    }
  } else if (t.status === 'calculating') {
    progress = 100;
    label = tr('tournament.calculating');
    barColor = 'bg-amber-500';
  } else if (t.status === 'completed') {
    progress = 100;
    label = tr('tournament.completed');
    barColor = 'bg-emerald-500';
  }

  return (
    <div className="space-y-1">
      {/* Label + countdown */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        {countdown && (
          <span className={`font-mono font-medium ${urgentPulse ? 'text-red-400 animate-pulse' : 'text-[var(--color-text)]'}`}>
            {countdown}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
