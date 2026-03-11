'use client';

import { useState } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  Gamepad2,
  Wallet,
  FileText,
  Settings,
  Wrench,
} from 'lucide-react';
import { OverviewTab } from './tabs/overview';
import { UsersTab } from './tabs/users';
import { GameTab } from './tabs/game';
import { FinanceTab } from './tabs/finance';
import { ContentTab } from './tabs/content';
import { SettingsTab } from './tabs/settings-tab';
import { SystemTab } from './tabs/system';

type Tab = 'overview' | 'users' | 'game' | 'finance' | 'content' | 'settings' | 'system';

const NAV_ITEMS: Array<{ id: Tab; icon: typeof LayoutDashboard; label: string; description: string }> = [
  { id: 'overview', icon: LayoutDashboard, label: 'Обзор', description: 'Аналитика и P&L' },
  { id: 'users', icon: Users, label: 'Пользователи', description: 'Управление юзерами' },
  { id: 'game', icon: Gamepad2, label: 'Игра', description: 'Ставки, ивенты, джекпот' },
  { id: 'finance', icon: Wallet, label: 'Финансы', description: 'Казна, стейкинг, магазин' },
  { id: 'content', icon: FileText, label: 'Контент', description: 'Анонсы и новости' },
  { id: 'settings', icon: Settings, label: 'Настройки', description: 'Конфиг, VIP, рефералы' },
  { id: 'system', icon: Wrench, label: 'Система', description: 'Диагностика и действия' },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const activeItem = NAV_ITEMS.find(n => n.id === activeTab)!;

  return (
    <div className="mx-auto max-w-[1400px] flex min-h-[calc(100dvh-80px)]">
      {/* ═══ Sidebar — Desktop ═══ */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]/30">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-[var(--color-border)]">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)]/15">
            <ShieldCheck size={18} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Admin Panel</h1>
            <p className="text-[9px] text-[var(--color-text-secondary)] leading-tight">CoinFlip Platform</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, icon: Icon, label, description }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                activeTab === id
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/20 hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Icon size={18} className={activeTab === id ? 'text-[var(--color-primary)]' : 'opacity-60'} />
              <div className="min-w-0">
                <span className={`text-[13px] block leading-tight ${activeTab === id ? 'font-semibold' : ''}`}>{label}</span>
                <span className="text-[9px] text-[var(--color-text-secondary)] block leading-tight truncate">{description}</span>
              </div>
            </button>
          ))}
        </nav>
      </aside>

      {/* ═══ Mobile Navigation ═══ */}
      <div className="lg:hidden fixed top-[60px] left-0 right-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur-sm">
        <div className="flex gap-1 overflow-x-auto no-scrollbar px-2 py-1.5">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeTab === id
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Main Content ═══ */}
      <main className="flex-1 min-w-0 px-3 sm:px-6 py-4 lg:py-6 mt-12 lg:mt-0">
        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <activeItem.icon size={20} className="text-[var(--color-primary)] hidden sm:block" />
          <div>
            <h2 className="text-lg font-bold">{activeItem.label}</h2>
            <p className="text-[11px] text-[var(--color-text-secondary)]">{activeItem.description}</p>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'game' && <GameTab />}
        {activeTab === 'finance' && <FinanceTab />}
        {activeTab === 'content' && <ContentTab />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'system' && <SystemTab />}
      </main>
    </div>
  );
}
