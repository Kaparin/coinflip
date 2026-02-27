'use client';

import { useState } from 'react';
import { Trophy, Info, ChevronDown, Plus } from 'lucide-react';
import { EventList } from '@/components/features/events/event-list';
import { SponsoredRaffleForm } from '@/components/features/events/sponsored-raffle-form';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';

export default function EventsPage() {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const [raffleFormOpen, setRaffleFormOpen] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-warning)]/15">
            <Trophy size={18} className="text-[var(--color-warning)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{t('events.title')}</h1>
            <p className="text-[10px] text-[var(--color-text-secondary)]">{t('events.subtitle')}</p>
          </div>
        </div>
        {isConnected && (
          <button
            type="button"
            onClick={() => setRaffleFormOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2 text-xs font-bold text-white transition-all hover:from-amber-400 hover:to-amber-500 active:scale-[0.98]"
          >
            <Plus size={14} />
            {t('sponsoredRaffle.button')}
          </button>
        )}
      </div>

      {/* Collapsible info section */}
      <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold select-none">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-[var(--color-primary)]" />
            {t('events.info.title')}
          </div>
          <ChevronDown size={16} className="text-[var(--color-text-secondary)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-[var(--color-border)] px-4 py-4 space-y-4 text-xs text-[var(--color-text-secondary)]">
          {/* Contest section */}
          <div>
            <h3 className="mb-1 text-xs font-bold text-indigo-400">{t('events.info.contestTitle')}</h3>
            <p className="leading-relaxed">{t('events.info.contestDesc')}</p>
          </div>
          {/* Raffle section */}
          <div>
            <h3 className="mb-1 text-xs font-bold text-amber-400">{t('events.info.raffleTitle')}</h3>
            <p className="leading-relaxed">{t('events.info.raffleDesc')}</p>
          </div>
          {/* Rules */}
          <div>
            <h3 className="mb-1 text-xs font-bold text-[var(--color-text)]">{t('events.info.rulesTitle')}</h3>
            <p className="leading-relaxed">{t('events.info.rulesDesc')}</p>
          </div>
        </div>
      </details>

      <EventList />

      {/* Sponsored Raffle Form */}
      <SponsoredRaffleForm open={raffleFormOpen} onClose={() => setRaffleFormOpen(false)} />
    </div>
  );
}
