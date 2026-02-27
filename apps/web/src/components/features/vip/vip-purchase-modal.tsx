'use client';

import { useState } from 'react';
import { FaCrown, FaStar, FaTimes } from 'react-icons/fa';
import { GiCutDiamond } from 'react-icons/gi';
import { formatLaunch } from '@coinflip/shared/constants';
import { useVipConfig, useVipStatus, usePurchaseVip } from '@/hooks/use-vip';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/components/ui/toast';
import { getUserFriendlyError } from '@/lib/user-friendly-errors';

interface VipPurchaseModalProps {
  open: boolean;
  onClose: () => void;
}

const tierMeta: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
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
    perks: ['vip.perks.badge', 'vip.perks.frame', 'vip.perks.boostsUnlimited', 'vip.perks.largeJackpot', 'vip.perks.megaJackpot', 'vip.perks.superMegaJackpot'],
  },
};

export function VipPurchaseModal({ open, onClose }: VipPurchaseModalProps) {
  const { t } = useTranslation();
  const { data: tiers } = useVipConfig();
  const { data: status } = useVipStatus();
  const purchaseMut = usePurchaseVip();
  const { addToast } = useToast();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  if (!open) return null;

  const activeTiers = tiers?.filter((t) => t.isActive) ?? [];

  const handlePurchase = async (tier: string) => {
    setSelectedTier(tier);
    try {
      await purchaseMut.mutateAsync(tier);
      addToast('success', t('vip.purchaseSuccess'));
      onClose();
    } catch (err) {
      addToast('error', getUserFriendlyError(err, t, 'generic'));
    } finally {
      setSelectedTier(null);
    }
  };

  const tierOrder: Record<string, number> = { silver: 1, gold: 2, diamond: 3 };
  const currentTierLevel = status?.tier ? tierOrder[status.tier] ?? 0 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-surface)] border border-white/10 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 animate-[scaleIn_0.2s_ease-out]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{t('vip.title')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <FaTimes className="h-4 w-4" />
          </button>
        </div>

        {status?.active && (
          <div className="mb-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-sm">
            {t('vip.currentTier')}: <span className="font-bold capitalize">{status.tier}</span>
            {' '}&middot;{' '}
            {t('vip.expiresAt')}: {status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—'}
          </div>
        )}

        <div className="grid gap-4">
          {activeTiers.map((config) => {
            const meta = tierMeta[config.tier];
            if (!meta) return null;
            const Icon = meta.icon;
            const isCurrentOrLower = (tierOrder[config.tier] ?? 0) <= currentTierLevel;
            const isLoading = purchaseMut.isPending && selectedTier === config.tier;

            return (
              <div
                key={config.tier}
                className={`relative rounded-xl border border-white/10 p-4 transition-all hover:border-white/20 ${
                  isCurrentOrLower ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-r ${meta.gradient}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold capitalize">{config.tier}</h3>
                    <p className="text-sm text-white/50">
                      {formatLaunch(config.price)} LAUNCH / {t('vip.month')}
                    </p>
                  </div>
                </div>

                <ul className="space-y-1 mb-4">
                  {meta.perks.map((perkKey) => (
                    <li key={perkKey} className="text-sm text-white/70 flex items-center gap-2">
                      <span className="text-green-400 text-xs">&#10003;</span>
                      {t(perkKey)}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePurchase(config.tier)}
                  disabled={isCurrentOrLower || purchaseMut.isPending}
                  className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${
                    isCurrentOrLower
                      ? 'bg-white/5 text-white/30 cursor-not-allowed'
                      : `bg-gradient-to-r ${meta.gradient} text-white hover:opacity-90 active:scale-[0.98]`
                  }`}
                >
                  {isLoading ? (
                    <span className="animate-pulse">{t('vip.purchasing')}</span>
                  ) : isCurrentOrLower ? (
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
      </div>
    </div>
  );
}
