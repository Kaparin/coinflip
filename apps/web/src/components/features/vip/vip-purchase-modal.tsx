'use client';

import { useState } from 'react';
import { FaCrown, FaStar } from 'react-icons/fa';
import { GiCutDiamond } from 'react-icons/gi';
import { AlertTriangle, Check, Zap, Shield, Trophy } from 'lucide-react';
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
  bgGradient: string;
  borderColor: string;
  glowColor: string;
  perks: string[];
}> = {
  silver: {
    icon: FaStar,
    gradient: 'from-gray-400 to-gray-300',
    bgGradient: 'from-gray-500/10 to-gray-400/5',
    borderColor: 'border-gray-400/30',
    glowColor: 'shadow-gray-400/20',
    perks: ['vip.perks.badge', 'vip.perks.frame', 'vip.perks.boosts10', 'vip.perks.largeJackpot'],
  },
  gold: {
    icon: FaCrown,
    gradient: 'from-yellow-500 to-amber-400',
    bgGradient: 'from-yellow-500/10 to-amber-400/5',
    borderColor: 'border-yellow-500/30',
    glowColor: 'shadow-yellow-500/20',
    perks: ['vip.perks.badge', 'vip.perks.frame', 'vip.perks.boostsUnlimited', 'vip.perks.largeJackpot', 'vip.perks.megaJackpot'],
  },
  diamond: {
    icon: GiCutDiamond,
    gradient: 'from-purple-500 via-pink-500 to-red-500',
    bgGradient: 'from-purple-500/10 via-pink-500/5 to-red-500/5',
    borderColor: 'border-purple-500/30',
    glowColor: 'shadow-purple-500/20',
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
  const [confirmInfo, setConfirmInfo] = useState<ConfirmInfo | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

  if (!open) return null;

  const activeTiers = tiers?.filter((t) => t.isActive) ?? [];
  const tierOrder: Record<string, number> = { silver: 1, gold: 2, diamond: 3 };
  const currentTierLevel = status?.tier ? tierOrder[status.tier] ?? 0 : 0;

  const handleConfirm = async () => {
    if (!confirmInfo) return;
    try {
      await purchaseMut.mutateAsync({ tier: confirmInfo.tier, period: confirmInfo.period });
      addToast('success', t('vip.purchaseSuccess'));
      setConfirmInfo(null);
      onClose();
    } catch (err) {
      addToast('error', getUserFriendlyError(err, t, 'generic'));
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
      <Modal open onClose={handleClose} title={t('vip.confirm.title')} showCloseButton={!isLoading}>
        <div className="space-y-4">
          {/* Tier header */}
          <div className={`flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r ${meta?.bgGradient ?? 'from-gray-500/10 to-gray-400/5'} border ${meta?.borderColor ?? 'border-gray-400/30'}`}>
            <div className={`p-3 rounded-xl bg-gradient-to-br ${meta?.gradient ?? 'from-gray-400 to-gray-300'} shadow-lg ${meta?.glowColor ?? ''}`}>
              <Icon size={24} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold capitalize text-base">{confirmInfo.tier} VIP</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {confirmInfo.period === 'yearly' ? t('vip.confirm.durationYearly') : t('vip.confirm.duration')}
              </p>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
            <span className="text-sm text-[var(--color-text-secondary)]">{t('vip.confirm.charge')}</span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary)]">
              {formattedPrice} <LaunchTokenIcon size={16} /> COIN
            </span>
          </div>

          {/* Warnings */}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={16} className="shrink-0 text-amber-400 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                {t('vip.confirm.deductionWarning', { amount: formattedPrice })}
              </p>
            </div>

            {isUpgrade && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle size={16} className="shrink-0 text-rose-400 mt-0.5" />
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  {t('vip.confirm.noRefundWarning', { currentTier: status!.tier! })}
                </p>
              </div>
            )}

            <div className="p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  {confirmInfo.period === 'yearly' ? t('vip.confirm.activateYearly') : t('vip.confirm.activateImmediately')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  {t('vip.confirm.noAutoRenew')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5">•</span>
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
              className="flex-1 py-3 rounded-xl border border-[var(--color-border)] text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] active:scale-[0.98] disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className={`flex-[2] py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-70 bg-gradient-to-r ${meta?.gradient ?? 'from-gray-400 to-gray-300'} hover:opacity-90 shadow-lg ${meta?.glowColor ?? ''}`}
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
      <div className="space-y-4">
        {/* Period toggle */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl bg-[var(--color-bg)] p-1 border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setPeriod('monthly')}
              className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
                period === 'monthly'
                  ? 'bg-[var(--color-primary)] text-white shadow-md'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
            >
              {t('vip.monthly')}
            </button>
            <button
              type="button"
              onClick={() => setPeriod('yearly')}
              className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                period === 'yearly'
                  ? 'bg-[var(--color-primary)] text-white shadow-md'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
            >
              {t('vip.yearly')}
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-success)]/20 text-[var(--color-success)] text-[10px] font-bold">
                {t('vip.save', { percent: '15' })}
              </span>
            </button>
          </div>
        </div>

        {/* Current status */}
        {status?.active && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-sm">
            <Shield size={14} className="text-[var(--color-primary)] shrink-0" />
            <span>
              {t('vip.currentTier')}: <span className="font-bold capitalize">{status.tier}</span>
              {' · '}
              {t('vip.expiresAt')}: {status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—'}
            </span>
          </div>
        )}

        {/* Tier cards */}
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
              className={`relative rounded-2xl border overflow-hidden transition-all ${
                isCurrentOrLower
                  ? 'opacity-50 border-[var(--color-border)]'
                  : `${meta.borderColor} hover:shadow-lg ${meta.glowColor}`
              }`}
            >
              {/* Gradient top accent */}
              <div className={`h-1 w-full bg-gradient-to-r ${meta.gradient}`} />

              <div className="p-4">
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${meta.gradient} shadow-lg ${meta.glowColor}`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold capitalize text-base">{config.tier}</h3>
                    <div className="flex items-center gap-1.5">
                      <LaunchTokenIcon size={13} />
                      <span className="text-sm font-semibold text-[var(--color-primary)]">
                        {formatLaunch(activePrice)} COIN
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        / {period === 'yearly' ? t('vip.year') : t('vip.month')}
                      </span>
                    </div>
                  </div>
                  {period === 'yearly' && savingsPercent > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-[var(--color-success)]/15 text-[var(--color-success)] text-[10px] font-bold shrink-0 border border-[var(--color-success)]/20">
                      -{savingsPercent}%
                    </span>
                  )}
                </div>

                {/* Perks */}
                <ul className="space-y-1.5 mb-4">
                  {meta.perks.map((perkKey) => (
                    <li key={perkKey} className="text-xs text-[var(--color-text-secondary)] flex items-center gap-2">
                      <Check size={12} className="text-[var(--color-success)] shrink-0" />
                      {t(perkKey)}
                    </li>
                  ))}
                </ul>

                {/* Buy button */}
                <button
                  onClick={() => setConfirmInfo({ tier: config.tier, price: activePrice, period })}
                  disabled={isCurrentOrLower || purchaseMut.isPending}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                    isCurrentOrLower
                      ? 'bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] cursor-not-allowed'
                      : `bg-gradient-to-r ${meta.gradient} text-white hover:opacity-90 shadow-lg ${meta.glowColor}`
                  }`}
                >
                  {isCurrentOrLower ? (
                    currentTierLevel === (tierOrder[config.tier] ?? 0) ? t('vip.currentPlan') : t('vip.included')
                  ) : status?.active ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Zap size={14} />
                      {t('vip.upgrade')}
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Trophy size={14} />
                      {t('vip.subscribe')}
                    </span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
