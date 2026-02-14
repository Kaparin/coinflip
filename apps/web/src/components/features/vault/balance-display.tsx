export interface BalanceDisplayProps {
  /** Wallet LAUNCH balance (not deposited) */
  walletBalance?: number;
  /** Available vault balance for new bets */
  vaultAvailable?: number;
  /** Amount currently locked in active bets */
  vaultLocked?: number;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

/* Default mock values */
const DEFAULTS = {
  walletBalance: 12_450,
  vaultAvailable: 3_200,
  vaultLocked: 800,
};

export function BalanceDisplay({
  walletBalance = DEFAULTS.walletBalance,
  vaultAvailable = DEFAULTS.vaultAvailable,
  vaultLocked = DEFAULTS.vaultLocked,
  onDeposit,
  onWithdraw,
}: BalanceDisplayProps) {
  const stats = [
    {
      label: 'Wallet',
      value: walletBalance,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6zm0 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6" />
        </svg>
      ),
      color: 'var(--color-text)',
    },
    {
      label: 'Available',
      value: vaultAvailable,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'var(--color-success)',
    },
    {
      label: 'Locked in Bets',
      value: vaultLocked,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
      color: 'var(--color-warning)',
    },
  ];

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="mb-5 text-lg font-bold">Vault Balance</h2>

      {/* Stat boxes */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
          >
            <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <span style={{ color: stat.color }}>{stat.icon}</span>
              <span className="text-xs font-medium">{stat.label}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-xl font-bold tabular-nums"
                style={{ color: stat.color }}
              >
                {stat.value.toLocaleString()}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">LAUNCH</span>
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onDeposit?.()}
          className="flex-1 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => onWithdraw?.()}
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-bold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}
