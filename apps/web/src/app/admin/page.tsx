'use client';

import { useState } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Dices,
  AlertTriangle,
  Wrench,
  Trophy,
  ArrowLeftRight,
  Gem,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { DashboardTab } from './tabs/dashboard';
import { UsersTab } from './tabs/users';
import { BetsTab } from './tabs/bets';
import { DiagnosticsTab } from './tabs/diagnostics';
import { ActionsTab } from './tabs/actions';
import { EventsTab } from './tabs/events';
import { TransactionsTab } from './tabs/transactions';
import { JackpotTab } from './tabs/jackpot';

type Tab = 'dashboard' | 'users' | 'bets' | 'events' | 'jackpot' | 'transactions' | 'diagnostics' | 'actions';

const TABS: Array<{ id: Tab; icon: typeof LayoutDashboard; label: string }> = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'users', icon: Users, label: 'Users' },
  { id: 'bets', icon: Dices, label: 'Bets' },
  { id: 'events', icon: Trophy, label: 'Events' },
  { id: 'jackpot', icon: Gem, label: 'Jackpot' },
  { id: 'transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { id: 'diagnostics', icon: AlertTriangle, label: 'Diagnostics' },
  { id: 'actions', icon: Wrench, label: 'Actions' },
];

export default function AdminPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]/15">
          <ShieldCheck size={20} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('admin.title')}</h1>
          <p className="text-xs text-[var(--color-text-secondary)]">{t('admin.subtitle')}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'bets' && <BetsTab />}
      {activeTab === 'events' && <EventsTab />}
      {activeTab === 'jackpot' && <JackpotTab />}
      {activeTab === 'transactions' && <TransactionsTab />}
      {activeTab === 'diagnostics' && <DiagnosticsTab />}
      {activeTab === 'actions' && <ActionsTab />}
    </div>
  );
}
