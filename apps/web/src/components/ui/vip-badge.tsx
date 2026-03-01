'use client';

import { GiCutDiamond } from 'react-icons/gi';
import { FaCrown, FaStar } from 'react-icons/fa';

type VipTier = 'silver' | 'gold' | 'diamond';

const tierConfig: Record<VipTier, {
  label: string;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
  gradient: string;
  color: string;
  shimmer: boolean;
}> = {
  silver: {
    label: 'Silver',
    icon: FaStar,
    gradient: 'linear-gradient(to right, #9ca3af, #d1d5db)',
    color: '#1c1917',
    shimmer: false,
  },
  gold: {
    label: 'Gold',
    icon: FaCrown,
    gradient: 'linear-gradient(to right, #eab308, #f59e0b)',
    color: '#78350f',
    shimmer: true,
  },
  diamond: {
    label: 'Diamond',
    icon: GiCutDiamond,
    gradient: 'linear-gradient(to right, #a855f7, #ec4899, #ef4444)',
    color: '#ffffff',
    shimmer: true,
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

  const iconPx = isSm ? 10 : 12;

  // All sizing via inline styles — immune to Chrome Android minimum font-size override.
  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    borderRadius: 9999,
    fontWeight: 700,
    lineHeight: 1,
    flexShrink: 0,
    padding: isSm ? '3px 6px' : '4px 8px',
    fontSize: isSm ? 10 : 12,
    background: config.gradient,
    backgroundSize: config.shimmer ? '200% auto' : undefined,
    animation: config.shimmer ? 'vip-shimmer 2s linear infinite' : undefined,
    color: config.color,
    cursor: onClick ? 'pointer' : undefined,
    border: 'none',
    margin: 0,
    verticalAlign: 'middle',
  };

  const iconStyle: React.CSSProperties = {
    width: iconPx,
    height: iconPx,
    flexShrink: 0,
  };

  return (
    <span
      style={badgeStyle}
      title={`${config.label} VIP`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as any); } } : undefined}
    >
      <Icon style={iconStyle} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
