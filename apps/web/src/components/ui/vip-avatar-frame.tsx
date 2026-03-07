'use client';

type VipTier = 'silver' | 'gold' | 'diamond';

interface VipAvatarFrameProps {
  tier: string | null | undefined;
  frameStyle?: string | null;
  children: React.ReactNode;
  className?: string;
}

const PARTICLE_CONFIG: Record<VipTier, { count: number; duration: number }> = {
  silver: { count: 1, duration: 4 },
  gold: { count: 2, duration: 3.5 },
  diamond: { count: 3, duration: 3 },
};

/**
 * Wraps an avatar with animated VIP border frame.
 * Base tiers use rotating conic-gradient borders + orbiting particles.
 * Custom diamond frames use themed border effects + particles.
 */
export function VipAvatarFrame({ tier, frameStyle, children, className = '' }: VipAvatarFrameProps) {
  if (!tier || !['silver', 'gold', 'diamond'].includes(tier)) {
    return <div className={`inline-flex ${className}`}>{children}</div>;
  }

  const vipTier = tier as VipTier;
  const isCustomDiamond = tier === 'diamond' && frameStyle && frameStyle !== 'default';
  const frameClass = isCustomDiamond
    ? `vip-frame-diamond-${frameStyle}`
    : `vip-frame-${vipTier}`;

  // Custom diamond frames still use border (not conic-gradient), so need padding
  const paddingClass = isCustomDiamond ? 'p-0.5' : '';

  const { count, duration } = PARTICLE_CONFIG[vipTier];

  return (
    <div className={`${frameClass} inline-flex relative ${paddingClass} ${className}`}>
      {children}
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`vip-orbit vip-orbit-${vipTier}`}
          style={{
            animationDelay: `${-(i * (duration / count))}s`,
            animationDuration: `${duration}s`,
          }}
        />
      ))}
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
