import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-6xl font-bold tracking-tight">
          Coin<span className="text-[var(--color-primary)]">Flip</span>
        </h1>
        <p className="max-w-lg text-lg text-[var(--color-text-secondary)]">
          Provably fair PvP Heads or Tails. Wager LAUNCH tokens on Axiome Chain.
          Winner takes the pot minus 10% commission.
        </p>
      </div>

      {/* CTA */}
      <div className="flex gap-4">
        <Link
          href="/game"
          className="rounded-xl bg-[var(--color-primary)] px-8 py-3 text-lg font-semibold
                     transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          Start Playing
        </Link>
        <button
          className="rounded-xl border border-[var(--color-border)] px-8 py-3 text-lg font-semibold
                     text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
        >
          How It Works
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-8 text-sm text-[var(--color-text-secondary)] mt-8">
        <div className="flex flex-col items-center gap-1">
          <span className="text-3xl font-bold text-[var(--color-text)]">10%</span>
          <span>Commission</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-3xl font-bold text-[var(--color-text)]">5 min</span>
          <span>Reveal Timeout</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-3xl font-bold text-[var(--color-text)]">1-click</span>
          <span>Gameplay</span>
        </div>
      </div>

      {/* Trust line */}
      <p className="text-xs text-[var(--color-text-secondary)] mt-4">
        You keep your seed phrase in Axiome Wallet. We never ask for it.
      </p>
    </main>
  );
}
