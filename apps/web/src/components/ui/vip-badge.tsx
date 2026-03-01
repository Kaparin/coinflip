'use client';

import type { IconType } from 'react-icons';
import { GiCutDiamond, GiCrown, GiLightningFrequency, GiSpikedDragonHead, GiEagleEmblem, GiSkullCrossedBones, GiFlame, GiCrossedSwords, GiStarShuriken, GiAllSeeingEye } from 'react-icons/gi';
import { FaCrown, FaStar } from 'react-icons/fa';

type VipTier = 'silver' | 'gold' | 'diamond';

const DIAMOND_ICON_MAP: Record<string, IconType> = {
  default: GiCutDiamond,
  crown: GiCrown,
  lightning: GiLightningFrequency,
  dragon: GiSpikedDragonHead,
  phoenix: GiEagleEmblem,
  skull: GiSkullCrossedBones,
  flame: GiFlame,
  sword: GiCrossedSwords,
  star: GiStarShuriken,
  eye: GiAllSeeingEye,
};

const tierConfig: Record<VipTier, {
  label: string;
  icon: IconType;
  colorClass: string;
  shimmer: boolean;
}> = {
  silver: {
    label: 'Silver',
    icon: FaStar,
    colorClass: 'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-900',
    shimmer: false,
  },
  gold: {
    label: 'Gold',
    icon: FaCrown,
    colorClass: 'bg-gradient-to-r from-yellow-500 to-amber-400 text-amber-900',
    shimmer: true,
  },
  diamond: {
    label: 'Diamond',
    icon: GiCutDiamond,
    colorClass: 'bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white',
    shimmer: true,
  },
};

interface VipBadgeProps {
  tier: string | null | undefined;
  badgeIcon?: string | null;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function VipBadge({ tier, badgeIcon, size = 'sm', showLabel = false, onClick }: VipBadgeProps) {
  if (!tier || !(tier in tierConfig)) return null;

  const config = tierConfig[tier as VipTier];
  const Icon = tier === 'diamond' && badgeIcon && badgeIcon !== 'default' && DIAMOND_ICON_MAP[badgeIcon]
    ? DIAMOND_ICON_MAP[badgeIcon]
    : config.icon;
  const isSm = size === 'sm';
  const iconPx = isSm ? 10 : 12;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-bold leading-none ${config.colorClass}${config.shimmer ? ' vip-badge-shimmer' : ''}${onClick ? ' cursor-pointer' : ''}`}
      style={{
        gap: isSm ? 2 : 3,
        padding: isSm ? '2px 6px' : '3px 8px',
        fontSize: isSm ? 10 : 12,
      }}
      title={`${config.label} VIP`}
      onClick={onClick}
    >
      <Icon style={{ width: iconPx, height: iconPx, display: 'block', flexShrink: 0 }} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
