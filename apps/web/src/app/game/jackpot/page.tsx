'use client';

import { useState } from 'react';
import { useJackpotActive } from '@/hooks/use-jackpot';
import { JackpotTierCard } from '@/components/features/jackpot/jackpot-tier-card';
import { JackpotHistory } from '@/components/features/jackpot/jackpot-history';
import { useTranslation } from '@/lib/i18n';
import { ArrowLeft, Gem, History } from 'lucide-react';
import Link from 'next/link';

type Tab = 'active' | 'history';

export default function JackpotPage() {
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const { data: pools, isLoading } = useJackpotActive();
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/game"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Gem size={20} className="text-violet-400" />
            {t('jackpot.title')}
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t('jackpot.subtitle')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--color-surface)] p-1 border border-[var(--color-border)]">
        <TabButton
          active={activeTab === 'active'}
          onClick={() => setActiveTab('active')}
          icon={<Gem size={14} />}
          label={t('jackpot.activePools')}
        />
        <TabButton
          active={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
          icon={<History size={14} />}
          label={t('jackpot.historyTab')}
        />
      </div>

      {/* Content */}
      {activeTab === 'active' && (
        <div className="space-y-3">
          {/* How it works */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              {t('jackpot.howItWorks')}
            </p>
          </div>

          {/* Pool cards */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-[var(--color-surface)] animate-pulse" />
              ))}
            </div>
          ) : pools && pools.length > 0 ? (
            <div className="space-y-3">
              {pools.map((pool) => (
                <JackpotTierCard key={pool.id} pool={pool} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">
              {t('jackpot.noPools')}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && <JackpotHistory />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-[var(--color-primary)] text-white'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
