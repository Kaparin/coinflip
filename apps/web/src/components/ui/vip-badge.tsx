'use client';

/**
 * VipBadge — fully inline-styled to be immune to Chrome Android font boosting.
 *
 * Chrome Android inflates font-size on mobile pages, which cascades to any
 * element sized via CSS classes, `em` units, or Tailwind utilities.
 * This component uses ONLY inline `style` for every dimension (height, padding,
 * font-size, icon width/height, gap). CSS classes are used solely for colors
 * and gradients. The shimmer animation is applied via a `@keyframes` class.
 *
 * react-icons render SVG with inline `width:1em;height:1em` — we override
 * them with explicit `style={{ width, height }}` on the SVG wrapper.
 */

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
  /** CSS classes for colors/gradients ONLY — no sizing */
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

/** Pixel dimensions for sm / md sizes */
const SIZES = {
  sm: { height: 16, paddingX: 6, paddingY: 2, fontSize: 10, iconSize: 10, gap: 2 },
  md: { height: 20, paddingX: 8, paddingY: 3, fontSize: 12, iconSize: 12, gap: 3 },
} as const;

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

  const s = SIZES[size];

  // Every dimension is inline — Chrome cannot boost any of these
  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    gap: s.gap,
    height: s.height,
    maxHeight: s.height,
    overflow: 'hidden',
    paddingLeft: s.paddingX,
    paddingRight: s.paddingX,
    paddingTop: s.paddingY,
    paddingBottom: s.paddingY,
    borderRadius: 9999,
    fontSize: s.fontSize,
    fontWeight: 700,
    lineHeight: 1,
    // Prevent Chrome Android font inflation
    WebkitTextSizeAdjust: 'none',
    textSizeAdjust: 'none' as any,
    cursor: onClick ? 'pointer' : undefined,
  };

  // Icon wrapper forces exact pixel dimensions, overriding react-icons' 1em default
  const iconStyle: React.CSSProperties = {
    width: s.iconSize,
    height: s.iconSize,
    flexShrink: 0,
    display: 'block',
  };

  return (
    <span
      className={`${config.colorClass}${config.shimmer ? ' vip-badge-shimmer' : ''}`}
      style={badgeStyle}
      title={`${config.label} VIP`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as any); } } : undefined}
    >
      <span style={iconStyle}>
        <Icon style={{ width: s.iconSize, height: s.iconSize, display: 'block' }} />
      </span>
      {showLabel && <span style={{ fontSize: s.fontSize, lineHeight: 1 }}>{config.label}</span>}
    </span>
  );
}
