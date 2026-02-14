'use client';

import { useState } from 'react';
import { StatusChips } from '@/components/features/auth/status-chips';

/* ------------------------------------------------------------------ */
/*  Mock state                                                         */
/* ------------------------------------------------------------------ */

const MOCK_STATE = {
  connected: true,
  address: 'axm1qz3f5xr7yn0d5kwmjx9m4yehsqq72rch3mqdv',
  vaultBalance: 3_200,
  oneClickEnabled: true,
  gasSponsored: true,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Header() {
  const [connected, setConnected] = useState(MOCK_STATE.connected);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            Coin<span className="text-[var(--color-primary)]">Flip</span>
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden items-center gap-5 md:flex">
          {/* Balance summary */}
          {connected && (
            <div className="flex items-center gap-1.5 text-sm">
              <svg className="h-4 w-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold tabular-nums">
                {MOCK_STATE.vaultBalance.toLocaleString()}
              </span>
              <span className="text-[var(--color-text-secondary)]">LAUNCH</span>
            </div>
          )}

          {/* Status chips (compact) */}
          {connected && (
            <StatusChips
              oneClickEnabled={MOCK_STATE.oneClickEnabled}
              gasSponsored={MOCK_STATE.gasSponsored}
              compact
            />
          )}

          {/* Wallet / Connect */}
          {connected ? (
            <button
              type="button"
              onClick={() => setConnected(false)}
              className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
              <span className="font-mono text-xs">
                {truncateAddress(MOCK_STATE.address)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConnected(true)}
              className="rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)] md:hidden"
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {connected && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-secondary)]">Vault</span>
                  <span className="text-sm font-bold tabular-nums">
                    {MOCK_STATE.vaultBalance.toLocaleString()} LAUNCH
                  </span>
                </div>
                <StatusChips
                  oneClickEnabled={MOCK_STATE.oneClickEnabled}
                  gasSponsored={MOCK_STATE.gasSponsored}
                />
              </>
            )}
            {connected ? (
              <button
                type="button"
                onClick={() => {
                  setConnected(false);
                  setMenuOpen(false);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm font-medium"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
                <span className="font-mono text-xs">
                  {truncateAddress(MOCK_STATE.address)}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConnected(true);
                  setMenuOpen(false);
                }}
                className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
