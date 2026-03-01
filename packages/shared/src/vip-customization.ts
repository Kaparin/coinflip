import { z } from 'zod';

// ─── Diamond Name Gradients ────────────────────────────
export const DIAMOND_NAME_GRADIENTS = [
  'default', 'fire', 'ocean', 'aurora', 'sunset',
  'neon', 'golden', 'ice', 'toxic', 'blood',
] as const;

// ─── Diamond Frame Styles ──────────────────────────────
export const DIAMOND_FRAME_STYLES = [
  'default', 'conic-spin', 'double-ring', 'neon-pulse', 'fire-ring',
  'frost', 'holographic', 'plasma', 'solar', 'shadow',
] as const;

// ─── Diamond Badge Icons ───────────────────────────────
export const DIAMOND_BADGE_ICONS = [
  'default', 'crown', 'lightning', 'dragon', 'phoenix',
  'skull', 'flame', 'sword', 'star', 'eye',
] as const;

export type DiamondNameGradient = (typeof DIAMOND_NAME_GRADIENTS)[number];
export type DiamondFrameStyle = (typeof DIAMOND_FRAME_STYLES)[number];
export type DiamondBadgeIcon = (typeof DIAMOND_BADGE_ICONS)[number];

export interface VipCustomization {
  nameGradient: DiamondNameGradient;
  frameStyle: DiamondFrameStyle;
  badgeIcon: DiamondBadgeIcon;
}

export const VipCustomizationSchema = z.object({
  nameGradient: z.enum(DIAMOND_NAME_GRADIENTS).optional(),
  frameStyle: z.enum(DIAMOND_FRAME_STYLES).optional(),
  badgeIcon: z.enum(DIAMOND_BADGE_ICONS).optional(),
});

export const DEFAULT_VIP_CUSTOMIZATION: VipCustomization = {
  nameGradient: 'default',
  frameStyle: 'default',
  badgeIcon: 'default',
};
