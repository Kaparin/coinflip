'use client';

import { useState } from 'react';
import { useJackpotActive } from '@/hooks/use-jackpot';
import { JackpotTierCard } from '@/components/features/jackpot/jackpot-tier-card';
import { JackpotHistory } from '@/components/features/jackpot/jackpot-history';
import { LaunchTokenIcon } from '@/components/ui';
import { useTranslation } from '@/lib/i18n';
import { formatLaunch } from '@coinflip/shared/constants';
import { ArrowLeft, Trophy, History, Coins, Target, Gift, Zap, Info, ChevronDown } from 'lucide-react';
import Link from 'next/link';

type Tab = 'active' | 'history';

export default function JackpotPage() {
  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [showInfo, setShowInfo] = useState(false);
  const { data: pools, isLoading } = useJackpotActive();
  const { t } = useTranslation();

  // Summary calculations
  const totalAmount = pools?.reduce((sum, p) => sum + BigInt(p.currentAmount), 0n) ?? 0n;
  const closest = pools?.reduce((best, pool) =>
    pool.progress > best.progress ? pool : best,
  );

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
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Trophy size={20} className="text-indigo-400 drop-shadow-[0_0_6px_rgba(129,140,248,0.4)]" />
            {t('jackpot.title')}
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t('jackpot.subtitle')}
          </p>
        </div>
        {/* Info toggle */}
        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
            showInfo
              ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
              : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-white/5'
          }`}
        >
          <Info size={16} />
        </button>
      </div>

      {/* Collapsible how-it-works */}
      {showInfo && (
        <div className="rounded-xl border border-indigo-500/20 bg-[var(--color-surface)] p-3.5 animate-fade-up">
          <div className="flex items-center gap-2 mb-2.5">
            <Info size={14} className="text-indigo-400" />
            <span className="text-xs font-bold text-indigo-400">{t('jackpot.howTitle')}</span>
          </div>
          <div className="space-y-2">
            <HowItWorksStep icon={Coins} text={t('jackpot.howStep1')} />
            <HowItWorksStep icon={Target} text={t('jackpot.howStep2')} />
            <HowItWorksStep icon={Gift} text={t('jackpot.howStep3')} />
            <HowItWorksStep icon={Zap} text={t('jackpot.howStep4')} />
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {pools && pools.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="text-[9px] uppercase tracking-wider text-[var(--color-text-secondary)] font-bold mb-1">
              {t('jackpot.summaryTotal')}
            </div>
            <div className="flex items-center gap-1.5">
              <LaunchTokenIcon size={16} />
              <span className="text-lg font-black tabular-nums text-indigo-400">
                {formatLaunch(totalAmount.toString())}
              </span>
            </div>
          </div>
          {closest && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="text-[9px] uppercase tracking-wider text-[var(--color-text-secondary)] font-bold mb-1">
                {t('jackpot.summaryClosest')}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-black tabular-nums">
                  {t(`jackpot.tiers.${closest.tierName}`)}
                </span>
                <span className="text-sm font-bold text-indigo-400">{closest.progress}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--color-surface)] p-1 border border-[var(--color-border)]">
        <TabButton
          active={activeTab === 'active'}
          onClick={() => setActiveTab('active')}
          icon={<Trophy size={14} />}
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
          {/* Pool cards */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-32 rounded-xl bg-[var(--color-surface)] animate-pulse" />
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

function HowItWorksStep({ icon: Icon, text }: { icon: typeof Coins; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/10">
        <Icon size={12} className="text-indigo-400" />
      </div>
      <span className="text-[11px] text-[var(--color-text-secondary)] leading-snug">{text}</span>
    </div>
  );
}
