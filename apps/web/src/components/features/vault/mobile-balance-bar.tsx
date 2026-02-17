'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useGetVaultBalance } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { fromMicroLaunch } from '@coinflip/shared/constants';
import { BalanceDisplay } from './balance-display';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';

/**
 * Compact balance bar for mobile — shows Available + In Bets in one row.
 * Expands to full BalanceDisplay on tap.
 */
export function MobileBalanceBar() {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const { pendingDeduction, isFrozen } = usePendingBalance();
  const { data, isLoading } = useGetVaultBalance({ query: { enabled: isConnected, refetchInterval: isFrozen ? false : 10_000 } });
  const [expanded, setExpanded] = useState(false);

  if (!isConnected) return null;

  if (isLoading) {
    return (
      <div className="md:hidden">
        <Skeleton className="h-12 rounded-xl" />
      </div>
    );
  }

  const balance = data?.data;
  const rawAvailable = BigInt(balance?.available ?? '0');
  const rawLocked = BigInt(balance?.locked ?? '0');
  const availableMicro = rawAvailable - pendingDeduction < 0n ? 0n : rawAvailable - pendingDeduction;
  const lockedMicro = rawLocked + pendingDeduction;

  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div className="md:hidden">
      {/* Compact bar — tap to expand */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition-colors active:bg-[var(--color-surface-hover)]"
      >
        {expanded ? (
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('balance.collapse')}</span>
        ) : (
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                {t('balance.yourGameBalance')}
              </span>
              <span className="text-base font-bold tabular-nums text-[var(--color-success)]">
                — {fmtNum(fromMicroLaunch(availableMicro))}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                {t('balance.inBetsShort')}
              </span>
              <span className="text-sm font-semibold tabular-nums text-[var(--color-warning)]">
                — {fmtNum(fromMicroLaunch(lockedMicro))}
              </span>
            </div>
          </div>
        )}
        <ChevronDown size={18} className={`shrink-0 text-[var(--color-text-secondary)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
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
