'use client';

import { useState } from 'react';
import { GiCutDiamond, GiCrown, GiLightningFrequency, GiSpikedDragonHead, GiEagleEmblem, GiSkullCrossedBones, GiFlame, GiCrossedSwords, GiStarShuriken, GiAllSeeingEye } from 'react-icons/gi';
import type { IconType } from 'react-icons';
import { useVipCustomization, useUpdateVipCustomization } from '@/hooks/use-vip';
import { useToast } from '@/components/ui/toast';
import { UserAvatar } from '@/components/ui';
import { VipAvatarFrame } from '@/components/ui/vip-avatar-frame';
import { useTranslation } from '@/lib/i18n';
import { useWalletContext } from '@/contexts/wallet-context';
import { Loader2 } from 'lucide-react';

const NAME_GRADIENTS = [
  { id: 'default', labelKey: 'vip.customization.default' },
  { id: 'fire', labelKey: 'vip.customization.gradient.fire' },
  { id: 'ocean', labelKey: 'vip.customization.gradient.ocean' },
  { id: 'aurora', labelKey: 'vip.customization.gradient.aurora' },
  { id: 'sunset', labelKey: 'vip.customization.gradient.sunset' },
  { id: 'neon', labelKey: 'vip.customization.gradient.neon' },
  { id: 'golden', labelKey: 'vip.customization.gradient.golden' },
  { id: 'ice', labelKey: 'vip.customization.gradient.ice' },
  { id: 'toxic', labelKey: 'vip.customization.gradient.toxic' },
  { id: 'blood', labelKey: 'vip.customization.gradient.blood' },
] as const;

const FRAME_STYLES = [
  { id: 'default', labelKey: 'vip.customization.default' },
  { id: 'conic-spin', labelKey: 'vip.customization.frame.conic-spin' },
  { id: 'double-ring', labelKey: 'vip.customization.frame.double-ring' },
  { id: 'neon-pulse', labelKey: 'vip.customization.frame.neon-pulse' },
  { id: 'fire-ring', labelKey: 'vip.customization.frame.fire-ring' },
  { id: 'frost', labelKey: 'vip.customization.frame.frost' },
  { id: 'holographic', labelKey: 'vip.customization.frame.holographic' },
  { id: 'plasma', labelKey: 'vip.customization.frame.plasma' },
  { id: 'solar', labelKey: 'vip.customization.frame.solar' },
  { id: 'shadow', labelKey: 'vip.customization.frame.shadow' },
] as const;

const BADGE_ICONS: Array<{ id: string; labelKey: string; icon: IconType }> = [
  { id: 'default', labelKey: 'vip.customization.default', icon: GiCutDiamond },
  { id: 'crown', labelKey: 'vip.customization.icon.crown', icon: GiCrown },
  { id: 'lightning', labelKey: 'vip.customization.icon.lightning', icon: GiLightningFrequency },
  { id: 'dragon', labelKey: 'vip.customization.icon.dragon', icon: GiSpikedDragonHead },
  { id: 'phoenix', labelKey: 'vip.customization.icon.phoenix', icon: GiEagleEmblem },
  { id: 'skull', labelKey: 'vip.customization.icon.skull', icon: GiSkullCrossedBones },
  { id: 'flame', labelKey: 'vip.customization.icon.flame', icon: GiFlame },
  { id: 'sword', labelKey: 'vip.customization.icon.sword', icon: GiCrossedSwords },
  { id: 'star', labelKey: 'vip.customization.icon.star', icon: GiStarShuriken },
  { id: 'eye', labelKey: 'vip.customization.icon.eye', icon: GiAllSeeingEye },
];

function getNameClass(id: string): string {
  if (id === 'default') return 'vip-name-diamond';
  return `vip-name-diamond-${id}`;
}

export function DiamondCustomizationPanel() {
  const wallet = useWalletContext();
  const address = wallet.address ?? '';
  const { t } = useTranslation();
  const { data: customization, isLoading } = useVipCustomization();
  const updateMutation = useUpdateVipCustomization();
  const { addToast } = useToast();

  const [selectedGradient, setSelectedGradient] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);

  // Use local state if changed, otherwise fall back to server data
  const activeGradient = selectedGradient ?? customization?.nameGradient ?? 'default';
  const activeFrame = selectedFrame ?? customization?.frameStyle ?? 'default';
  const activeIcon = selectedIcon ?? customization?.badgeIcon ?? 'default';

  const hasChanges =
    (selectedGradient !== null && selectedGradient !== (customization?.nameGradient ?? 'default')) ||
    (selectedFrame !== null && selectedFrame !== (customization?.frameStyle ?? 'default')) ||
    (selectedIcon !== null && selectedIcon !== (customization?.badgeIcon ?? 'default'));

  const handleSave = async () => {
    const data: Record<string, string> = {};
    if (selectedGradient !== null) data.nameGradient = selectedGradient;
    if (selectedFrame !== null) data.frameStyle = selectedFrame;
    if (selectedIcon !== null) data.badgeIcon = selectedIcon;

    try {
      await updateMutation.mutateAsync(data);
      addToast('success', t('vip.customization.saved'));
      // Reset local state since server now has the values
      setSelectedGradient(null);
      setSelectedFrame(null);
      setSelectedIcon(null);
    } catch {
      addToast('error', t('errors.somethingWentWrong'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-secondary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-3">
      {/* Name Gradient */}
      <div>
        <p className="text-xs font-bold mb-2 text-[var(--color-text-secondary)]">{t('vip.customization.nameGradient')}</p>
        <div className="grid grid-cols-5 gap-2">
          {NAME_GRADIENTS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGradient(g.id)}
              className={`rounded-lg border px-2 py-2 text-[10px] font-bold transition-all text-center ${
                activeGradient === g.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
              }`}
            >
              <span className={getNameClass(g.id)}>{t(g.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Avatar Frame */}
      <div>
        <p className="text-xs font-bold mb-2 text-[var(--color-text-secondary)]">{t('vip.customization.frameStyle')}</p>
        <div className="grid grid-cols-5 gap-2">
          {FRAME_STYLES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFrame(f.id)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 transition-all ${
                activeFrame === f.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
              }`}
            >
              <VipAvatarFrame tier="diamond" frameStyle={f.id}>
                <div className="rounded-full overflow-hidden">
                  <UserAvatar address={address} size={28} />
                </div>
              </VipAvatarFrame>
              <span className="text-[9px] text-[var(--color-text-secondary)] leading-tight text-center">{t(f.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Badge Icon */}
      <div>
        <p className="text-xs font-bold mb-2 text-[var(--color-text-secondary)]">{t('vip.customization.badgeIcon')}</p>
        <div className="grid grid-cols-5 gap-2">
          {BADGE_ICONS.map((b) => {
            const Icon = b.icon;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedIcon(b.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-all ${
                  activeIcon === b.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                }`}
              >
                <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500">
                  <Icon className="h-4 w-4 text-white" />
                </span>
                <span className="text-[9px] text-[var(--color-text-secondary)] leading-tight text-center">{t(b.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!hasChanges || updateMutation.isPending}
        className="w-full rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {updateMutation.isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('vip.customization.save')}
          </span>
        ) : (
          t('vip.customization.save')
        )}
      </button>
    </div>
  );
}
