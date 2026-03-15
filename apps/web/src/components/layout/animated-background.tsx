'use client';

import { useTheme } from '@/lib/theme';

/**
 * Animated background with floating gradient orbs.
 * Pure CSS, GPU-accelerated (transform + opacity), zero JS runtime cost.
 * Renders behind all content via fixed positioning + z-index: -1.
 * Adapts to dark/light theme.
 */
export function AnimatedBackground() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Base gradient — adapts to theme */}
      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{
          background: isLight
            ? 'linear-gradient(180deg, #f8f9fa 0%, #f0f1f5 50%, #e8e9ed 100%)'
            : 'linear-gradient(180deg, #08090d 0%, #0a0a0f 50%, #0a0a0a 100%)',
        }}
      />

      {/* Orb 1 — large indigo, top-left, slow drift */}
      <div
        className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full blur-[120px] animate-bg-orb-1 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, #6366f1, transparent 70%)',
          opacity: isLight ? 0.12 : 0.07,
        }}
      />

      {/* Orb 2 — amber/gold, bottom-right, medium drift */}
      <div
        className="absolute -bottom-24 -right-24 w-[400px] h-[400px] rounded-full blur-[100px] animate-bg-orb-2 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, #f59e0b, transparent 70%)',
          opacity: isLight ? 0.1 : 0.06,
        }}
      />

      {/* Orb 3 — teal accent, center-right, floating */}
      <div
        className="absolute top-1/3 right-[10%] w-[300px] h-[300px] rounded-full blur-[90px] animate-bg-orb-3 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, #14b8a6, transparent 70%)',
          opacity: isLight ? 0.08 : 0.05,
        }}
      />

      {/* Orb 4 — violet, bottom-left, slow pulse */}
      <div
        className="absolute bottom-[15%] left-[5%] w-[350px] h-[350px] rounded-full blur-[110px] animate-bg-orb-4 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, #8b5cf6, transparent 70%)',
          opacity: isLight ? 0.08 : 0.04,
        }}
      />

      {/* Subtle noise/grain overlay for texture */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: isLight ? 0.03 : 0.015,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
      />
    </div>
  );
}
