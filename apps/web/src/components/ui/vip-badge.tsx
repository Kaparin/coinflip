'use client';

import { GiCutDiamond } from 'react-icons/gi';
import { FaCrown, FaStar } from 'react-icons/fa';

type VipTier = 'silver' | 'gold' | 'diamond';

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
  size?: 'sm' | 'md';
  showLabel?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function VipBadge({ tier, size = 'sm', showLabel = false, onClick }: VipBadgeProps) {
  if (!tier || !(tier in tierConfig)) return null;

  const config = tierConfig[tier as VipTier];
  const Icon = config.icon;
  const isSm = size === 'sm';

  // Use explicit pixel sizes — Chrome Android enforces minimum font-size (~12px),
  // which inflates react-icons' inline `1em` sizing and breaks the badge on mobile.
  const iconPx = isSm ? 10 : 12;

  const classes = `inline-flex shrink-0 items-center gap-0.5 rounded-full font-bold leading-none ${config.className} ${
    isSm ? 'px-1.5 py-[3px] text-[10px]' : 'px-2 py-1 text-xs'
  }${onClick ? ' cursor-pointer' : ''}`;

  return (
    <span
      className={classes}
      title={`${config.label} VIP`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as any); } } : undefined}
    >
      <Icon size={iconPx} className="shrink-0" />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
