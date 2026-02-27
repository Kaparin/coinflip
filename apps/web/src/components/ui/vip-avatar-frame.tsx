'use client';

type VipTier = 'silver' | 'gold' | 'diamond';

interface VipAvatarFrameProps {
  tier: string | null | undefined;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps an avatar/image with an animated VIP border frame.
 * No JS cost — pure CSS animations defined in globals.css.
 */
export function VipAvatarFrame({ tier, children, className = '' }: VipAvatarFrameProps) {
  if (!tier || !['silver', 'gold', 'diamond'].includes(tier)) {
    return <div className={className}>{children}</div>;
  }

  const frameClass = `vip-frame-${tier as VipTier}`;

  return (
    <div className={`${frameClass} p-0.5 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Apply VIP name color class based on tier.
 */
export function getVipNameClass(tier: string | null | undefined): string {
  if (!tier) return '';
  if (tier === 'silver') return 'vip-name-silver';
  if (tier === 'gold') return 'vip-name-gold';
  if (tier === 'diamond') return 'vip-name-diamond';
  return '';
}
