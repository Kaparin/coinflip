'use client';

import { useGetActiveEvents, useGetCompletedEvents } from '@coinflip/api-client';
import { EventCard } from './event-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { Trophy } from 'lucide-react';

export function EventList() {
  const { t } = useTranslation();
  const { data: activeData, isLoading: activeLoading } = useGetActiveEvents({
    query: { staleTime: 60_000, refetchInterval: 120_000 },
  });
  const { data: completedData, isLoading: completedLoading } = useGetCompletedEvents(
    { limit: 5 },
    { query: { staleTime: 60_000 } },
  );

  const allActiveEvents = activeData?.data ?? [];
  const completedEvents = completedData?.data ?? [];
  const isLoading = activeLoading || completedLoading;

  // Split into truly active (already started) and upcoming (starts in the future)
  const now = new Date();
  const liveEvents = allActiveEvents.filter(e => e.status === 'active' && new Date(e.startsAt) <= now);
  const upcomingEvents = allActiveEvents.filter(e =>
    (e.status === 'draft' && new Date(e.startsAt) > now) ||
    (e.status === 'active' && new Date(e.startsAt) > now),
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (liveEvents.length === 0 && upcomingEvents.length === 0 && completedEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Trophy size={40} className="mb-3 text-[var(--color-text-secondary)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">{t('events.noEvents')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active (live) events */}
      {liveEvents.length > 0 && (
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
      {upcomingEvents.length > 0 && (
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

      {/* Recent results */}
      {completedEvents.length > 0 && (
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
