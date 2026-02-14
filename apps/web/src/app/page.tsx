export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Coin<span className="text-[var(--color-primary)]">Flip</span>
        </h1>
        <p className="max-w-md text-lg text-[var(--color-text-secondary)]">
          Provably fair PvP Heads or Tails. Wager LAUNCH tokens on Axiome Chain.
        </p>
      </div>

      {/* CTA */}
      <button
        className="rounded-xl bg-[var(--color-primary)] px-8 py-3 text-lg font-semibold
                   transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        Connect Wallet
      </button>

      {/* Info */}
      <div className="flex gap-8 text-sm text-[var(--color-text-secondary)]">
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-bold text-[var(--color-text)]">10%</span>
          <span>Commission</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-bold text-[var(--color-text)]">5 min</span>
          <span>Reveal timeout</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-bold text-[var(--color-text)]">1-click</span>
          <span>Gameplay</span>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-secondary)]">
        You keep your seed phrase in Axiome Wallet. We never ask for it.
      </p>
    </main>
  );
}
