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
  icon: React.ComponentType<{ className?: string; size?: number }>;
  className: string;
}> = {
  silver: {
    label: 'Silver',
    icon: FaStar,
    className: 'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-900',
  },
  gold: {
    label: 'Gold',
    icon: FaCrown,
    className: 'bg-gradient-to-r from-yellow-500 to-amber-400 text-amber-900 vip-badge-shimmer',
  },
  diamond: {
    label: 'Diamond',
    icon: GiCutDiamond,
    className: 'bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white vip-badge-shimmer',
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

  // Inline styles for font-size and max-height prevent Chrome Android font boosting.
  // react-icons render SVG with inline `width:1em;height:1em` — Tailwind classes
  // cannot override inline styles, so we pass `size` in px directly to the Icon.
  const badgeStyle: React.CSSProperties = {
    fontSize: isSm ? '10px' : '12px',
    maxHeight: isSm ? '18px' : '22px',
  };

  const classes = `inline-flex shrink-0 items-center gap-0.5 rounded-full font-bold leading-none ${config.className} ${
    isSm ? 'px-1.5 py-0.5' : 'px-2 py-1'
  }${onClick ? ' cursor-pointer' : ''}`;

  return (
    <span
      className={classes}
      style={badgeStyle}
      title={`${config.label} VIP`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as any); } } : undefined}
    >
      <Icon size={iconPx} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
