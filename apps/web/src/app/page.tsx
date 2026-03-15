'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';
import { ArrowRight, Shield, Clock, Zap } from 'lucide-react';

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-6 overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-indigo-600/[0.04] blur-[100px] animate-bg-orb-1" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-purple-600/[0.05] blur-[100px] animate-bg-orb-2" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-cyan-600/[0.03] blur-[120px] animate-bg-orb-3" />
      </div>

      {/* Hero */}
      <div className="relative flex flex-col items-center gap-4 text-center">
        {/* Logo with glow */}
        <div className="relative flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center mb-2 animate-bounce-slow">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-2xl animate-pulse" />
          <Image
            src="/logo-landing.png"
            alt="Heads or Tails"
            width={128}
            height={128}
            priority
            className="object-contain relative drop-shadow-[0_0_30px_rgba(99,102,241,0.3)]"
          />
        </div>

        {/* Title with stagger */}
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
          <span className="inline-block animate-fade-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>Heads</span>
          {' '}
          <span className="inline-block animate-fade-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>or</span>
          {' '}
          <span className="inline-block animate-fade-up bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: '0.3s' }}>
            Tails
          </span>
        </h1>

        {/* Tagline */}
        <p className="max-w-sm text-sm sm:text-lg text-[var(--color-text-secondary)] animate-fade-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
          {t('landing.tagline')}
        </p>
      </div>

      {/* CTA */}
      <div className="relative animate-fade-up" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
        <Link
          href="/game"
          className="btn-ripple btn-glow btn-glow-primary group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-indigo-500/25 hover:from-indigo-500 hover:to-purple-500 hover:shadow-[0_0_40px_rgba(99,102,241,0.35)]"
        >
          {t('landing.startPlaying')}
          <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      {/* Stats */}
      <div className="relative flex gap-4 sm:gap-8 mt-4 animate-fade-up" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
        {[
          { icon: Shield, value: '10%', label: t('landing.commissionLabel'), color: 'text-emerald-400' },
          { icon: Clock, value: '5 min', label: t('landing.timeoutLabel'), color: 'text-amber-400' },
          { icon: Zap, value: '1-click', label: t('landing.gameplayLabel'), color: 'text-indigo-400' },
        ].map(({ icon: Icon, value, label, color }, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1 p-3 sm:p-4 rounded-xl bg-[var(--color-surface)]/50 border border-[var(--color-border)]/50 backdrop-blur-sm"
          >
            <Icon size={16} className={`${color} mb-0.5`} />
            <span className={`text-xl sm:text-2xl font-black ${color}`}>{value}</span>
            <span className="text-[10px] sm:text-xs text-[var(--color-text-secondary)]">{label}</span>
          </div>
        ))}
      </div>

      {/* Trust */}
      <p className="relative text-[10px] text-[var(--color-text-secondary)]/60 mt-2 text-center max-w-xs animate-fade-up" style={{ animationDelay: '0.7s', animationFillMode: 'both' }}>
        {t('landing.securityNote')}
      </p>
    </main>
  );
}
