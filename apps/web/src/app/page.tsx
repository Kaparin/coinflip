'use client';

import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      {/* Hero */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-4xl animate-pulse-glow mb-2">
          🪙
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
          Coin<span className="text-[var(--color-primary)]">Flip</span>
        </h1>
        <p className="max-w-sm text-sm sm:text-lg text-[var(--color-text-secondary)]">
          {t('landing.tagline')}
        </p>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto">
        <Link
          href="/game"
          className="rounded-xl bg-[var(--color-primary)] px-8 py-3.5 text-center text-base font-bold transition-colors hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
        >
          {t('landing.startPlaying')}
        </Link>
      </div>

      {/* Stats */}
      <div className="flex gap-6 sm:gap-8 text-xs sm:text-sm text-[var(--color-text-secondary)] mt-4">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl sm:text-3xl font-bold text-[var(--color-text)]">10%</span>
          <span>{t('landing.commissionLabel')}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl sm:text-3xl font-bold text-[var(--color-text)]">5 min</span>
          <span>{t('landing.timeoutLabel')}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl sm:text-3xl font-bold text-[var(--color-text)]">1-click</span>
          <span>{t('landing.gameplayLabel')}</span>
        </div>
      </div>

      {/* Trust */}
      <p className="text-[10px] text-[var(--color-text-secondary)] mt-4 text-center">
        {t('landing.securityNote')}
      </p>
    </main>
  );
}
