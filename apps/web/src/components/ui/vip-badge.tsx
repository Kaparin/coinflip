'use client';

import { GiCutDiamond } from 'react-icons/gi';
import { FaCrown, FaStar } from 'react-icons/fa';

type VipTier = 'silver' | 'gold' | 'diamond';

const tierConfig: Record<VipTier, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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

  const classes = `inline-flex items-center gap-0.5 rounded-full font-bold ${config.className} ${
    isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
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
      <Icon className={isSm ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
