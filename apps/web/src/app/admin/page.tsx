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
  Megaphone,
  Crown,
  Settings,
  PieChart,
  Newspaper,
  ShoppingCart,
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
import { AnnouncementsTab } from './tabs/announcements';
import { VipTab } from './tabs/vip';
import { ConfigTab } from './tabs/config';
import { CommissionTab } from './tabs/commission';
import { NewsTab } from './tabs/news';
import { PresaleTab } from './tabs/presale';

type Tab = 'dashboard' | 'users' | 'bets' | 'events' | 'jackpot' | 'vip' | 'transactions' | 'diagnostics' | 'actions' | 'announcements' | 'config' | 'commission' | 'news' | 'presale';

const TABS: Array<{ id: Tab; icon: typeof LayoutDashboard; label: string }> = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'users', icon: Users, label: 'Users' },
  { id: 'bets', icon: Dices, label: 'Bets' },
  { id: 'events', icon: Trophy, label: 'Events' },
  { id: 'jackpot', icon: Gem, label: 'Jackpot' },
  { id: 'vip', icon: Crown, label: 'VIP' },
  { id: 'commission', icon: PieChart, label: 'Commission' },
  { id: 'transactions', icon: ArrowLeftRight, label: 'Txns' },
  { id: 'announcements', icon: Megaphone, label: 'Announce' },
  { id: 'news', icon: Newspaper, label: 'News' },
  { id: 'presale', icon: ShoppingCart, label: 'Presale' },
  { id: 'config', icon: Settings, label: 'Config' },
  { id: 'diagnostics', icon: AlertTriangle, label: 'Diag' },
  { id: 'actions', icon: Wrench, label: 'Actions' },
];

export default function AdminPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)]/15">
          <ShieldCheck size={18} className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h1 className="text-lg font-bold">{t('admin.title')}</h1>
          <p className="text-[10px] text-[var(--color-text-secondary)]">{t('admin.subtitle')}</p>
        </div>
      </div>

      {/* Tab Navigation — scrollable, no-scrollbar, compact */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'bg-[var(--color-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
            }`}
            title={label}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'bets' && <BetsTab />}
      {activeTab === 'events' && <EventsTab />}
      {activeTab === 'jackpot' && <JackpotTab />}
      {activeTab === 'vip' && <VipTab />}
      {activeTab === 'transactions' && <TransactionsTab />}
      {activeTab === 'diagnostics' && <DiagnosticsTab />}
      {activeTab === 'actions' && <ActionsTab />}
      {activeTab === 'announcements' && <AnnouncementsTab />}
      {activeTab === 'config' && <ConfigTab />}
      {activeTab === 'commission' && <CommissionTab />}
      {activeTab === 'news' && <NewsTab />}
      {activeTab === 'presale' && <PresaleTab />}
    </div>
  );
}
