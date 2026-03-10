'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Wallet } from 'lucide-react';
import { useGetVaultBalance } from '@coinflip/api-client';
import { useWalletContext } from '@/contexts/wallet-context';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { fromMicroLaunch } from '@coinflip/shared/constants';
import { isWsConnected, POLL_INTERVAL_WS_CONNECTED, POLL_INTERVAL_WS_DISCONNECTED } from '@/hooks/use-websocket';
import { GameTokenIcon } from '@/components/ui';
import { BalanceDisplay } from './balance-display';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/i18n';
import { useAxmRates } from '@/hooks/use-axm-rates';

/**
 * Compact balance bar for mobile — shows key balances in a clean single row.
 * Expands to full BalanceDisplay on tap.
 */
export function MobileBalanceBar() {
  const { t } = useTranslation();
  const { isConnected, address } = useWalletContext();
  const { data, isLoading } = useGetVaultBalance({
    query: {
      enabled: isConnected,
      refetchInterval: () => isWsConnected() ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED,
    },
  });
  const { data: walletBalanceRaw } = useWalletBalance(address);
  const { data: rates } = useAxmRates();
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click/tap
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [expanded]);

  if (!isConnected) return null;

  if (isLoading) {
    return (
      <div className="md:hidden">
        <Skeleton className="h-12 rounded-xl" />
      </div>
    );
  }

  const balance = data?.data;
  const availableMicro = BigInt(balance?.available ?? '0');
  const lockedMicro = BigInt(balance?.locked ?? '0');
  const walletBalanceHuman = fromMicroLaunch(walletBalanceRaw ?? '0');
  const availableHuman = fromMicroLaunch(availableMicro);
  const lockedHuman = fromMicroLaunch(lockedMicro);

  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <div ref={containerRef} className="md:hidden">
      {/* Compact bar — tap to expand */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 transition-colors active:bg-[var(--color-surface-hover)]"
      >
        {expanded ? (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('balance.collapse')}</span>
            <ChevronDown size={16} className="text-[var(--color-text-secondary)] rotate-180 transition-transform duration-200" />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* Main balance — vault available */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-lg font-bold tabular-nums text-[var(--color-success)]">
                {fmtNum(availableHuman)}
              </span>
              <GameTokenIcon size={16} />
              {rates?.axm_usd && availableHuman > 0 && (
                <span className="text-[10px] text-[var(--color-text-secondary)] tabular-nums">
                  ≈${(availableHuman * rates.axm_usd).toFixed(2)}
                </span>
              )}
            </div>

            {/* Secondary info pills */}
            <div className="flex items-center gap-1.5 shrink-0">
              {lockedHuman > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 px-2 py-0.5">
                  <span className="text-[9px] text-[var(--color-warning)] font-medium">{t('balance.inBetsShort')}</span>
                  <span className="text-[11px] font-bold tabular-nums text-[var(--color-warning)]">{fmtNum(lockedHuman)}</span>
                </span>
              )}
              {walletBalanceHuman > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5">
                  <Wallet size={10} className="text-[var(--color-text-secondary)]" />
                  <span className="text-[11px] font-bold tabular-nums">{fmtNum(walletBalanceHuman)}</span>
                </span>
              )}
            </div>

            {/* Expand chevron */}
            <ChevronDown size={16} className="shrink-0 text-[var(--color-text-secondary)] transition-transform duration-200" />
          </div>
        )}
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
