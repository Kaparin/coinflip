export type EventTheme = {
  borderGlow: string;
  bgGradient: string;
  accentColor: string;
  accentColorLight: string;
  badgeBg: string;
  iconColor: string;
  shimmer: boolean;
};

const CONTEST_THEME: EventTheme = {
  borderGlow: 'border-glow-contest',
  bgGradient: 'bg-gradient-to-br from-indigo-500/8 via-violet-500/4 to-transparent',
  accentColor: 'var(--color-primary)',
  accentColorLight: 'rgba(99,102,241,0.15)',
  badgeBg: 'bg-indigo-500/15 text-indigo-400',
  iconColor: 'text-indigo-400',
  shimmer: true,
};

const RAFFLE_THEME: EventTheme = {
  borderGlow: 'border-glow-raffle',
  bgGradient: 'bg-gradient-to-br from-amber-500/8 via-yellow-500/4 to-transparent',
  accentColor: 'var(--color-warning)',
  accentColorLight: 'rgba(245,158,11,0.15)',
  badgeBg: 'bg-amber-500/15 text-amber-400',
  iconColor: 'text-amber-400',
  shimmer: true,
};

export function getEventTheme(type: string): EventTheme {
  return type === 'contest' ? CONTEST_THEME : RAFFLE_THEME;
}
