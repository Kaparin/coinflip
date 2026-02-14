'use client';

import { useState } from 'react';
import { CreateBetForm } from '@/components/features/bets/create-bet-form';
import { BetList } from '@/components/features/bets/bet-list';
import { HistoryList } from '@/components/features/history/history-list';
import { BalanceDisplay } from '@/components/features/vault/balance-display';

type Tab = 'bets' | 'history';

export default function GamePage() {
  const [activeTab, setActiveTab] = useState<Tab>('bets');

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Balance Row */}
      <BalanceDisplay />

      {/* Create Bet */}
      <section>
        <h2 className="text-xl font-bold mb-4">Create a Bet</h2>
        <CreateBetForm />
      </section>

      {/* Tabs: Open Bets / History */}
      <section>
        <div className="flex gap-1 border-b border-[var(--color-border)] mb-4">
          <button
            onClick={() => setActiveTab('bets')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'bets'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            Open Bets
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'history'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            History
          </button>
        </div>

        {activeTab === 'bets' ? <BetList /> : <HistoryList />}
      </section>
    </div>
  );
}
