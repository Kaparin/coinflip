'use client';

interface JackpotProgressBarProps {
  progress: number; // 0-100
  tierName: string;
}

const TIER_COLORS: Record<string, { bar: string; bg: string; glow: string }> = {
  mini: {
    bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    bg: 'bg-emerald-500/10',
    glow: 'shadow-emerald-500/30',
  },
  medium: {
    bar: 'bg-gradient-to-r from-blue-500 to-blue-400',
    bg: 'bg-blue-500/10',
    glow: 'shadow-blue-500/30',
  },
  large: {
    bar: 'bg-gradient-to-r from-violet-500 to-violet-400',
    bg: 'bg-violet-500/10',
    glow: 'shadow-violet-500/30',
  },
  mega: {
    bar: 'bg-gradient-to-r from-amber-500 to-yellow-400',
    bg: 'bg-amber-500/10',
    glow: 'shadow-amber-500/30',
  },
  super_mega: {
    bar: 'bg-gradient-to-r from-red-500 via-amber-400 to-yellow-300',
    bg: 'bg-red-500/10',
    glow: 'shadow-red-500/30',
  },
};

export function JackpotProgressBar({ progress, tierName }: JackpotProgressBarProps) {
  const colors = TIER_COLORS[tierName] ?? TIER_COLORS.mini!;
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className={`relative h-2.5 w-full rounded-full ${colors.bg} overflow-hidden`}>
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${colors.bar} transition-all duration-700 ease-out ${
          clamped > 90 ? `shadow-lg ${colors.glow} animate-pulse-glow` : ''
        }`}
        style={{ width: `${clamped}%` }}
      />
      {/* Shimmer overlay on the filled portion */}
      {clamped > 5 && (
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}
