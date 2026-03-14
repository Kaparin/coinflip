'use client';

import { useGetActiveEvents, useGetCompletedEvents } from '@coinflip/api-client';
import { EventCard } from './event-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { Trophy, Swords } from 'lucide-react';
import { useActiveTournaments, useCompletedTournaments } from '@/hooks/use-tournaments';
import { TournamentCard } from '@/components/features/tournaments/tournament-card';

export function EventList({ filter = 'all' }: { filter?: 'all' | 'tournaments' | 'events' }) {
  const { t } = useTranslation();
  const { data: activeData, isLoading: activeLoading } = useGetActiveEvents({
    query: { staleTime: 60_000, refetchInterval: 120_000 },
  });
  const { data: completedData, isLoading: completedLoading } = useGetCompletedEvents(
    { limit: 5 },
    { query: { staleTime: 60_000 } },
  );

  // Tournaments
  const { data: activeTournaments, isLoading: tournamentsLoading } = useActiveTournaments();
  const { data: completedTournaments } = useCompletedTournaments(5);

  const allActiveEvents = activeData?.data ?? [];
  const completedEvents = completedData?.data ?? [];
  const isLoading = activeLoading || completedLoading || tournamentsLoading;

  // Split into truly active (already started) and upcoming (starts in the future)
  const now = new Date();
  const liveEvents = allActiveEvents.filter(e => e.status === 'active' && new Date(e.startsAt) <= now);
  const upcomingEvents = allActiveEvents.filter(e =>
    (e.status === 'draft' && new Date(e.startsAt) > now) ||
    (e.status === 'active' && new Date(e.startsAt) > now),
  );

  const liveTournaments = (activeTournaments ?? []).filter(t => t.status === 'active');
  const registrationTournaments = (activeTournaments ?? []).filter(t => t.status === 'registration');

  const showTournaments = filter === 'all' || filter === 'tournaments';
  const showEvents = filter === 'all' || filter === 'events';

  const hasAny = (showEvents && (liveEvents.length > 0 || upcomingEvents.length > 0 || completedEvents.length > 0))
    || (showTournaments && (liveTournaments.length > 0 || registrationTournaments.length > 0 || (completedTournaments ?? []).length > 0));

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Trophy size={40} className="mb-3 text-[var(--color-text-secondary)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.noEvents')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active tournaments */}
      {showTournaments && liveTournaments.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] flex items-center gap-1.5">
            <Swords size={12} />
            {t('tournament.tournaments')} — Live
          </h2>
          <div className="space-y-3">
            {liveTournaments.map((tournament, i) => (
              <TournamentCard key={tournament.id} tournament={tournament} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Registration tournaments */}
      {showTournaments && registrationTournaments.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] flex items-center gap-1.5">
            <Swords size={12} />
            {t('tournament.tournaments')} — {t('tournament.registration')}
          </h2>
          <div className="space-y-3">
            {registrationTournaments.map((tournament, i) => (
              <TournamentCard key={tournament.id} tournament={tournament} index={liveTournaments.length + i} />
            ))}
          </div>
        </section>
      )}

      {/* Active (live) events */}
      {showEvents && liveEvents.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('events.activeEvents')}
          </h2>
          <div className="space-y-3">
            {liveEvents.map((event, i) => (
              <EventCard key={event.id} event={event} size="large" index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming events */}
      {showEvents && upcomingEvents.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('events.upcomingEvents')}
          </h2>
          <div className="space-y-3">
            {upcomingEvents.map((event, i) => (
              <EventCard key={event.id} event={event} size="large" index={liveEvents.length + i} />
            ))}
          </div>
        </section>
      )}

      {/* Completed tournaments */}
      {showTournaments && (completedTournaments ?? []).length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)] flex items-center gap-1.5">
            <Swords size={12} />
            {t('tournament.tournaments')} — {t('events.recentResults')}
          </h2>
          <div className="space-y-2">
            {(completedTournaments ?? []).map((tournament, i) => (
              <TournamentCard key={tournament.id} tournament={tournament} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Recent results (events) */}
      {showEvents && completedEvents.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {t('events.recentResults')}
          </h2>
          <div className="space-y-2">
            {completedEvents.map((event, i) => (
              <EventCard key={event.id} event={event} size="compact" index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
