'use client';

import { useState } from 'react';
import { FaCrown, FaStar } from 'react-icons/fa';
import { GiCutDiamond } from 'react-icons/gi';
import { AlertTriangle } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import { useVipConfig, useVipStatus, usePurchaseVip } from '@/hooks/use-vip';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/components/ui/toast';
import { getUserFriendlyError } from '@/lib/user-friendly-errors';
import { LaunchTokenIcon } from '@/components/ui';
import { Modal } from '@/components/ui/modal';

interface VipPurchaseModalProps {
  open: boolean;
  onClose: () => void;
}

const tierMeta: Record<string, {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  gradient: string;
  perks: string[];
}> = {
  silver: {
    icon: FaStar,
    gradient: 'from-gray-400 to-gray-300',
    perks: ['vip.perks.badge', 'vip.perks.frame', 'vip.perks.boosts10', 'vip.perks.largeJackpot'],
  },
  gold: {
    icon: FaCrown,
    gradient: 'from-yellow-500 to-amber-400',
    perks: ['vip.perks.badge', 'vip.perks.frame', 'vip.perks.boostsUnlimited', 'vip.perks.largeJackpot', 'vip.perks.megaJackpot'],
  },
  diamond: {
    icon: GiCutDiamond,
    gradient: 'from-purple-500 via-pink-500 to-red-500',
    perks: ['vip.perks.badge', 'vip.perks.frame', 'vip.perks.customization', 'vip.perks.boostsUnlimited', 'vip.perks.largeJackpot', 'vip.perks.megaJackpot', 'vip.perks.superMegaJackpot'],
  },
};

interface ConfirmInfo {
  tier: string;
  price: string;
  period: 'monthly' | 'yearly';
}

export function VipPurchaseModal({ open, onClose }: VipPurchaseModalProps) {
  const { t } = useTranslation();
  const { data: tiers } = useVipConfig();
  const { data: status } = useVipStatus();
  const purchaseMut = usePurchaseVip();
  const { addToast } = useToast();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [confirmInfo, setConfirmInfo] = useState<ConfirmInfo | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

  if (!open) return null;

  const activeTiers = tiers?.filter((t) => t.isActive) ?? [];
  const tierOrder: Record<string, number> = { silver: 1, gold: 2, diamond: 3 };
  const currentTierLevel = status?.tier ? tierOrder[status.tier] ?? 0 : 0;

  const handleConfirm = async () => {
    if (!confirmInfo) return;
    setSelectedTier(confirmInfo.tier);
    try {
      await purchaseMut.mutateAsync({ tier: confirmInfo.tier, period: confirmInfo.period });
      addToast('success', t('vip.purchaseSuccess'));
      setConfirmInfo(null);
      onClose();
    } catch (err) {
      addToast('error', getUserFriendlyError(err, t, 'generic'));
    } finally {
      setSelectedTier(null);
    }
  };

  const handleClose = () => {
    setConfirmInfo(null);
    onClose();
  };

  // Confirmation screen
  if (confirmInfo) {
    const meta = tierMeta[confirmInfo.tier];
    const Icon = meta?.icon ?? FaStar;
    const isUpgrade = status?.active && currentTierLevel > 0;
    const isLoading = purchaseMut.isPending;
    const formattedPrice = formatLaunch(confirmInfo.price);

    return (
      <Modal open onClose={handleClose} title={t('vip.confirm.title')}>
        <div className="space-y-4">
          {/* Tier being purchased */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
            <div className={`p-2.5 rounded-lg bg-gradient-to-r ${meta?.gradient ?? 'from-gray-400 to-gray-300'}`}>
              <Icon size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold capitalize">{confirmInfo.tier} VIP</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {confirmInfo.period === 'yearly' ? t('vip.confirm.durationYearly') : t('vip.confirm.duration')}
              </p>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
            <span className="text-sm text-[var(--color-text-secondary)]">{t('vip.confirm.charge')}</span>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              {formattedPrice} <LaunchTokenIcon size={16} />
            </span>
          </div>

          {/* Warnings */}
          <div className="space-y-2">
            {/* Funds deduction warning */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={16} className="shrink-0 text-amber-400 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                {t('vip.confirm.deductionWarning', { amount: formattedPrice })}
              </p>
            </div>

            {/* Non-refundable warning if upgrading */}
            {isUpgrade && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle size={16} className="shrink-0 text-rose-400 mt-0.5" />
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  {t('vip.confirm.noRefundWarning', { currentTier: status!.tier! })}
                </p>
              </div>
            )}

            {/* General info */}
            <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
                <li className="flex items-start gap-2">
                  <span className="text-[var(--color-text-secondary)] mt-0.5">•</span>
                  {confirmInfo.period === 'yearly' ? t('vip.confirm.activateYearly') : t('vip.confirm.activateImmediately')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--color-text-secondary)] mt-0.5">•</span>
                  {t('vip.confirm.noAutoRenew')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--color-text-secondary)] mt-0.5">•</span>
                  {t('vip.confirm.nonRefundable')}
                </li>
              </ul>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmInfo(null)}
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-70 bg-gradient-to-r ${meta?.gradient ?? 'from-gray-400 to-gray-300'} hover:opacity-90`}
            >
              {isLoading ? (
                <span className="animate-pulse">{t('vip.purchasing')}</span>
              ) : (
                t('vip.confirm.confirmPurchase')
              )}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Tier selection screen
  return (
    <Modal open onClose={handleClose} title={t('vip.title')}>
      <div className="space-y-3">
        {/* Monthly / Yearly toggle */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl bg-white/5 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => setPeriod('monthly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === 'monthly'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              {t('vip.monthly')}
            </button>
            <button
              type="button"
              onClick={() => setPeriod('yearly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                period === 'yearly'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              {t('vip.yearly')}
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                {t('vip.save', { percent: '15' })}
              </span>
            </button>
          </div>
        </div>

        {status?.active && (
          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-sm">
            {t('vip.currentTier')}: <span className="font-bold capitalize">{status.tier}</span>
            {' '}&middot;{' '}
            {t('vip.expiresAt')}: {status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—'}
          </div>
        )}

        {activeTiers.map((config) => {
          const meta = tierMeta[config.tier];
          if (!meta) return null;
          const Icon = meta.icon;
          const isCurrentOrLower = (tierOrder[config.tier] ?? 0) <= currentTierLevel;
          const activePrice = period === 'yearly' ? (config.yearlyPrice ?? config.price) : config.price;
          const monthlyCost12 = Number(config.price) * 12;
          const savingsPercent = period === 'yearly' && config.yearlyPrice
            ? Math.round((1 - Number(config.yearlyPrice) / monthlyCost12) * 100)
            : 0;

          return (
            <div
              key={config.tier}
              className={`relative rounded-xl border border-white/10 p-3 sm:p-4 transition-all hover:border-white/20 ${
                isCurrentOrLower ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg bg-gradient-to-r ${meta.gradient}`}>
                  <Icon size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold capitalize text-sm">{config.tier}</h3>
                  <p className="text-xs text-white/50">
                    {formatLaunch(activePrice)} COIN / {period === 'yearly' ? t('vip.year') : t('vip.month')}
                  </p>
                </div>
                {period === 'yearly' && savingsPercent > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold shrink-0">
                    {t('vip.save', { percent: String(savingsPercent) })}
                  </span>
                )}
              </div>

              <ul className="space-y-0.5 mb-3">
                {meta.perks.map((perkKey) => (
                  <li key={perkKey} className="text-xs text-white/70 flex items-center gap-2">
                    <span className="text-green-400 text-[10px]">&#10003;</span>
                    {t(perkKey)}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => setConfirmInfo({ tier: config.tier, price: activePrice, period })}
                disabled={isCurrentOrLower || purchaseMut.isPending}
                className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                  isCurrentOrLower
                    ? 'bg-white/5 text-white/30 cursor-not-allowed'
                    : `bg-gradient-to-r ${meta.gradient} text-white hover:opacity-90 active:scale-[0.98]`
                }`}
              >
                {isCurrentOrLower ? (
                  currentTierLevel === (tierOrder[config.tier] ?? 0) ? t('vip.currentPlan') : t('vip.included')
                ) : status?.active ? (
                  t('vip.upgrade')
                ) : (
                  t('vip.subscribe')
                )}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
