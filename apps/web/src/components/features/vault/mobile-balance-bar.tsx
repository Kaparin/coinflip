'use client';

import { useState } from 'react';
import { useGetVaultBalance } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { fromMicroLaunch } from '@coinflip/shared/constants';
import { BalanceDisplay } from './balance-display';
import { useTranslation } from '@/lib/i18n';

/**
 * Compact balance bar for mobile — shows Available + In Bets in one row.
 * Expands to full BalanceDisplay on tap.
 */
export function MobileBalanceBar() {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const { pendingDeduction, isFrozen } = usePendingBalance();
  const { data } = useGetVaultBalance({ query: { enabled: isConnected, refetchInterval: isFrozen ? false : 10_000 } });
  const [expanded, setExpanded] = useState(false);

  if (!isConnected) return null;

  const balance = data?.data;
  const rawAvailable = BigInt(balance?.available ?? '0');
  const rawLocked = BigInt(balance?.locked ?? '0');
  const availableMicro = rawAvailable - pendingDeduction < 0n ? 0n : rawAvailable - pendingDeduction;
  const lockedMicro = rawLocked + pendingDeduction;

  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div className="md:hidden">
      {/* Compact bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 transition-colors active:bg-[var(--color-surface-hover)]"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--color-text-secondary)]">{t('balance.play')}</span>
            <span className="text-sm font-bold tabular-nums text-[var(--color-success)]">
              {fmtNum(fromMicroLaunch(availableMicro))}
            </span>
          </div>
          <div className="h-3 w-px bg-[var(--color-border)]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--color-text-secondary)]">{t('balance.bets')}</span>
            <span className="text-sm font-bold tabular-nums text-[var(--color-warning)]">
              {fmtNum(fromMicroLaunch(lockedMicro))}
            </span>
          </div>
          <span className="text-[9px] text-[var(--color-text-secondary)]">L</span>
        </div>
        <svg
          className={`h-4 w-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Expanded: full BalanceDisplay */}
      {expanded && (
        <div className="mt-2 animate-fade-up">
          <BalanceDisplay />
        </div>
      )}
    </div>
  );
}
