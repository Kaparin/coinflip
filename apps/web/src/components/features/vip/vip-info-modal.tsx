'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaCrown, FaStar } from 'react-icons/fa';
import { GiCutDiamond } from 'react-icons/gi';
import { Modal } from '@/components/ui/modal';
import { VipPurchaseModal } from './vip-purchase-modal';
import { useTranslation } from '@/lib/i18n';

type VipTier = 'silver' | 'gold' | 'diamond';

const tierMeta: Record<VipTier, {
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

interface VipInfoModalProps {
  open: boolean;
  onClose: () => void;
  tier: VipTier;
  context?: 'player' | 'jackpot';
  jackpotTierName?: string;
}

export function VipInfoModal({ open, onClose, tier, context = 'player', jackpotTierName }: VipInfoModalProps) {
  const { t } = useTranslation();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const meta = tierMeta[tier];
  if (!meta) return null;

  const Icon = meta.icon;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  const description = context === 'jackpot' && jackpotTierName
    ? t('vip.info.jackpotRequiresVip', { jackpot: jackpotTierName, tier: tierLabel })
    : t('vip.info.playerHasVip', { tier: tierLabel });

  return (
    <>
      <Modal open={open} onClose={onClose} title={`${tierLabel} VIP`}>
        <div className="flex flex-col items-center gap-4">
          {/* Tier icon badge */}
          <div className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${meta.gradient}`}>
            <Icon className="h-8 w-8 text-white" />
          </div>

          {/* Description */}
          <p className="text-center text-sm text-[var(--color-text-secondary)]">
            {description}
          </p>

          {/* Privileges */}
          <div className="w-full">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
              {t('vip.info.privileges')}
            </h4>
            <ul className="space-y-1.5">
              {meta.perks.map((perkKey) => (
                <li key={perkKey} className="text-sm text-[var(--color-text)] flex items-center gap-2">
                  <span className="text-green-400 text-xs shrink-0">&#10003;</span>
                  {t(perkKey)}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA button */}
          <button
            type="button"
            onClick={() => { onClose(); setPurchaseOpen(true); }}
            className={`w-full rounded-xl bg-gradient-to-r ${meta.gradient} px-4 py-3 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]`}
          >
            {t('vip.info.getVip')}
          </button>
        </div>
      </Modal>

      {mounted && createPortal(
        <VipPurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />,
        document.body,
      )}
    </>
  );
}
