'use client';

type VipTier = 'silver' | 'gold' | 'diamond';

interface VipAvatarFrameProps {
  tier: string | null | undefined;
  frameStyle?: string | null;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps an avatar/image with an animated VIP border frame.
 * No JS cost — pure CSS animations defined in globals.css.
 */
export function VipAvatarFrame({ tier, frameStyle, children, className = '' }: VipAvatarFrameProps) {
  if (!tier || !['silver', 'gold', 'diamond'].includes(tier)) {
    return <div className={`inline-flex ${className}`}>{children}</div>;
  }

  const frameClass = tier === 'diamond' && frameStyle && frameStyle !== 'default'
    ? `vip-frame-diamond-${frameStyle}`
    : `vip-frame-${tier as VipTier}`;

  return (
    <div className={`${frameClass} inline-flex p-0.5 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Apply VIP name color class based on tier + optional Diamond gradient preset.
 */
export function getVipNameClass(tier: string | null | undefined, nameGradient?: string | null): string {
  if (!tier) return '';
  if (tier === 'diamond' && nameGradient && nameGradient !== 'default') {
    return `vip-name-diamond-${nameGradient}`;
  }
  if (tier === 'silver') return 'vip-name-silver';
  if (tier === 'gold') return 'vip-name-gold';
  if (tier === 'diamond') return 'vip-name-diamond';
  return '';
}
