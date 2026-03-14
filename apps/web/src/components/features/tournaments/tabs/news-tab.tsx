'use client';

import { Bell, Megaphone } from 'lucide-react';
import { useTranslation, pickLocalized } from '@/lib/i18n';
import { useTournamentNotifications } from '@/hooks/use-tournaments';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TYPE_COLORS: Record<string, string> = {
  registration_open: 'text-indigo-400 bg-indigo-500/10',
  registration_closing: 'text-amber-400 bg-amber-500/10',
  started: 'text-emerald-400 bg-emerald-500/10',
  last_day: 'text-amber-400 bg-amber-500/10',
  ending_soon: 'text-red-400 bg-red-500/10',
  ended: 'text-gray-400 bg-gray-500/10',
  results: 'text-[var(--color-warning)] bg-amber-500/10',
};

export function TournamentNewsTab({ tournamentId }: { tournamentId: string }) {
  const { t, locale } = useTranslation();
  const { data: notifications, isLoading } = useTournamentNotifications(tournamentId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!notifications?.length) {
    return (
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center animate-fade-up">
        <Bell size={32} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t('tournament.news')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-up">
      {notifications.map((n, i) => {
        const title = pickLocalized(locale, n.title, n.titleEn, n.titleRu);
        const message = pickLocalized(locale, n.message ?? '', n.messageEn, n.messageRu);
        const colorClass = TYPE_COLORS[n.type] ?? 'text-[var(--color-text)] bg-[var(--color-bg)]';

        return (
          <div
            key={n.id}
            className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 animate-fade-up`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                <Megaphone size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium text-[var(--color-text)] truncate">{title}</h4>
                  <span className="text-[10px] text-[var(--color-text-secondary)] whitespace-nowrap">{timeAgo(n.createdAt)}</span>
                </div>
                {message && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{message}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
