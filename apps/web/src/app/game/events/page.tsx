'use client';

import { Trophy } from 'lucide-react';
import { EventList } from '@/components/features/events/event-list';
import { useTranslation } from '@/lib/i18n';

export default function EventsPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-warning)]/15">
          <Trophy size={18} className="text-[var(--color-warning)]" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t('events.title')}</h1>
          <p className="text-[10px] text-[var(--color-text-secondary)]">{t('events.subtitle')}</p>
        </div>
      </div>

      <EventList />
    </div>
  );
}
