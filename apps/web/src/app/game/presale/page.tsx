'use client';

import { useState, useCallback } from 'react';
import { ArrowDown, CheckCircle, ExternalLink, Loader2, ShoppingCart, TrendingUp, Coins, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { useNativeBalance } from '@/hooks/use-wallet-balance';
import { usePresaleConfig, usePresaleStatus } from '@/hooks/use-presale';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { LaunchTokenIcon, AxmIcon } from '@/components/ui';
import { signPresaleBuy, signDepositTxBytes } from '@/lib/wallet-signer';
import { OnboardingModal } from '@/components/features/auth/onboarding-modal';
import { PRESALE_CONTRACT, EXPLORER_URL, API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useTranslation } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { getUserFriendlyError } from '@/lib/user-friendly-errors';

type BuyStep = 'signing' | 'broadcasting' | 'confirming';

const AXM_PRESETS = [1, 5, 10, 50, 100];

export default function PresalePage() {
  const { t } = useTranslation();
  const { isConnected, address, getWallet } = useWalletContext();
  const queryClient = useQueryClient();
  const { data: nativeBalance } = useNativeBalance(address);
  const { data: presaleConfig, isLoading: configLoading } = usePresaleConfig();
  const { data: presaleStatus, isLoading: statusLoading } = usePresaleStatus();

  const { data: grantStatus } = useGrantStatus();
  const oneClickEnabled = grantStatus?.authz_granted ?? false;

  const [axmInput, setAxmInput] = useState('');
  const [isBuying, setIsBuying] = useState(false);
  const [buyStep, setBuyStep] = useState<BuyStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successTx, setSuccessTx] = useState<{ txHash: string; coinAmount: string; axmAmount: string; pending?: boolean } | null>(null);

  // Post-purchase deposit flow
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<'signing' | 'broadcasting' | 'confirming' | null>(null);
  const [depositDone, setDepositDone] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const nativeHuman = Number(nativeBalance ?? '0') / 1_000_000;
  const axmAmount = parseFloat(axmInput) || 0;
  const microAxm = Math.floor(axmAmount * 1_000_000);

  // Rate calculation
  const rateNum = presaleStatus?.rate_num ?? 1;
  const rateDenom = presaleStatus?.rate_denom ?? 1;
  const coinOutput = axmAmount * rateNum / rateDenom;
  const coinAvailable = Number(presaleStatus?.coin_available ?? '0') / 1_000_000;
  const totalAxmRaised = Number(presaleConfig?.total_axm_received ?? '0') / 1_000_000;
  const totalCoinSold = Number(presaleConfig?.total_coin_sold ?? '0') / 1_000_000;

  const isEnabled = presaleStatus?.enabled ?? false;
  const isLoading = configLoading || statusLoading;

  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const refreshBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wallet-native-balance'] });
    queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
    queryClient.invalidateQueries({ queryKey: ['presale'] });
    queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
  }, [queryClient]);

  // Deposit purchased COIN into game vault
  const handleDeposit = useCallback(async () => {
    if (!address || !successTx || isDepositing) return;
    const coinAmount = parseFloat(successTx.coinAmount.replace(/,/g, ''));
    if (!coinAmount || coinAmount <= 0) return;

    setIsDepositing(true);
    setDepositStep('signing');
    setError(null);

    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');

      const { txBytes } = await signDepositTxBytes(wallet, address, coinAmount);
      setDepositStep('broadcasting');

      const res = await fetch(`${API_URL}/api/v1/vault/deposit/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ tx_bytes: txBytes }),
      });

      setDepositStep('confirming');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Deposit broadcast failed');
      }

      setDepositDone(true);
      refreshBalances();

      // After deposit, prompt authz if not set up
      if (!oneClickEnabled) {
        setTimeout(() => setShowOnboarding(true), 1500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(getUserFriendlyError(msg, t, 'generic'));
      refreshBalances();
    } finally {
      setIsDepositing(false);
      setDepositStep(null);
    }
  }, [address, successTx, isDepositing, getWallet, refreshBalances, oneClickEnabled, t]);

  const handleBuy = useCallback(async () => {
    if (!address || !axmAmount || isBuying) return;

    setError(null);
    setSuccessTx(null);
    setIsBuying(true);
    setBuyStep('signing');

    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');

      const result = await signPresaleBuy(wallet, address, String(microAxm), (step) => {
        setBuyStep(step);
      });

      if (result.timedOut) {
        // Transaction was broadcast but confirmation timed out — likely succeeded
        setSuccessTx({
          txHash: result.txHash,
          coinAmount: fmtNum(coinOutput),
          axmAmount: fmtNum(axmAmount),
          pending: true,
        });
      } else {
        setSuccessTx({
          txHash: result.txHash,
          coinAmount: fmtNum(coinOutput),
          axmAmount: fmtNum(axmAmount),
        });
      }
      setAxmInput('');
      refreshBalances();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(getUserFriendlyError(msg, t, 'generic'));
      // Still refresh — tx might have gone through despite error
      refreshBalances();
    } finally {
      setIsBuying(false);
      setBuyStep(null);
    }
  }, [address, axmAmount, microAxm, coinOutput, getWallet, refreshBalances, isBuying]);

  // No contract configured
  if (!PRESALE_CONTRACT) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-[var(--color-text-secondary)]">{t('presale.noContract')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <ShoppingCart size={24} className="text-[var(--color-primary)]" />
          <h1 className="text-xl font-extrabold">{t('presale.title')}</h1>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">{t('presale.subtitle')}</p>
      </div>

      {/* Stats bar */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center">
            <p className="text-[10px] text-[var(--color-text-secondary)]">{t('presale.rate')}</p>
            <p className="text-sm font-bold text-[var(--color-primary)]">
              1:{rateNum / rateDenom}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center">
            <p className="text-[10px] text-[var(--color-text-secondary)]">{t('presale.available')}</p>
            <p className="text-sm font-bold">{fmtNum(coinAvailable)}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center">
            <p className="text-[10px] text-[var(--color-text-secondary)]">{t('presale.totalSold')}</p>
            <p className="text-sm font-bold">{fmtNum(totalCoinSold)}</p>
          </div>
        </div>
      )}

      {/* Disabled notice */}
      {!isLoading && !isEnabled && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3">
          <AlertTriangle size={16} className="text-[var(--color-warning)] shrink-0" />
          <p className="text-xs font-medium text-[var(--color-warning)]">{t('presale.disabled')}</p>
        </div>
      )}

      {/* Sold out notice */}
      {!isLoading && isEnabled && coinAvailable === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3">
          <AlertTriangle size={16} className="text-[var(--color-danger)] shrink-0" />
          <p className="text-xs font-medium text-[var(--color-danger)]">{t('presale.soldOut')}</p>
        </div>
      )}

      {/* Swap card */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {/* You Pay */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 overflow-hidden">
            <span className="text-xs font-medium text-[var(--color-text-secondary)] shrink-0">{t('presale.youPay')}</span>
            {isConnected && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)] truncate">
                {t('presale.balance')}: {fmtNum(nativeHuman)} <AxmIcon size={12} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={axmInput}
              onChange={(e) => {
                setAxmInput(e.target.value);
                setError(null);
                setSuccessTx(null);
              }}
              placeholder="0"
              min="0"
              step="0.1"
              disabled={!isEnabled || isBuying}
              className="flex-1 min-w-0 bg-transparent text-2xl font-bold outline-none placeholder:text-[var(--color-text-secondary)]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <div className="flex items-center gap-1.5 shrink-0 rounded-lg bg-[var(--color-bg)] px-3 py-1.5">
              <AxmIcon size={20} />
              <span className="text-sm font-bold whitespace-nowrap">AXM</span>
            </div>
          </div>

          {/* Presets */}
          {isConnected && (
            <div className="flex gap-1.5">
              {AXM_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => { setAxmInput(String(preset)); setError(null); setSuccessTx(null); }}
                  disabled={!isEnabled || isBuying}
                  className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 text-[10px] font-bold transition-colors hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/10 disabled:opacity-50"
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setAxmInput(String(Math.floor(nativeHuman * 100) / 100)); setError(null); setSuccessTx(null); }}
                disabled={!isEnabled || isBuying || nativeHuman === 0}
                className="flex-1 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 py-1.5 text-[10px] font-bold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20 disabled:opacity-50"
              >
                MAX
              </button>
            </div>
          )}
        </div>

        {/* Arrow divider */}
        <div className="flex items-center justify-center -my-3 relative z-10">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <ArrowDown size={14} className="text-[var(--color-text-secondary)]" />
          </div>
        </div>

        {/* You Get */}
        <div className="p-4 bg-[var(--color-bg)]/50 space-y-2">
          <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('presale.youGet')}</span>
          <div className="flex items-center gap-3">
            <span className={`flex-1 min-w-0 text-2xl font-bold truncate ${coinOutput > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-secondary)]/30'}`}>
              {coinOutput > 0 ? fmtNum(coinOutput) : '0'}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 rounded-lg bg-[var(--color-surface)] px-3 py-1.5">
              <LaunchTokenIcon size={20} />
              <span className="text-sm font-bold whitespace-nowrap">COIN</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3">
          <p className="text-xs text-[var(--color-danger)]">{error}</p>
        </div>
      )}

      {/* Success / Pending */}
      {successTx && (
        <div className={`rounded-xl border px-4 py-3 space-y-3 ${
          successTx.pending
            ? 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10'
            : 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10'
        }`}>
          <div className="flex items-center gap-2">
            {successTx.pending ? (
              <Clock size={16} className="text-[var(--color-warning)]" />
            ) : (
              <CheckCircle size={16} className="text-[var(--color-success)]" />
            )}
            <p className={`text-xs font-bold ${successTx.pending ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}>
              {successTx.pending ? t('presale.pendingTitle') : t('presale.success')}
            </p>
          </div>
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            {successTx.pending
              ? t('presale.pendingDetail', { amount: successTx.coinAmount })
              : t('presale.successDetail', { amount: successTx.coinAmount, axm: successTx.axmAmount })}
          </p>
          <a
            href={`${EXPLORER_URL}/transactions/${successTx.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] hover:underline"
          >
            {t('presale.txHash')} <ExternalLink size={10} />
          </a>

          {/* Auto-deposit buttons (only after confirmed purchase, not pending) */}
          {!successTx.pending && !depositDone && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleDeposit}
                disabled={isDepositing}
                className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-xs font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] disabled:opacity-50 active:scale-[0.98]"
              >
                {isDepositing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {depositStep === 'signing' ? t('presale.depositSigning')
                      : depositStep === 'broadcasting' ? t('presale.depositBroadcasting')
                      : depositStep === 'confirming' ? t('presale.depositConfirming')
                      : t('presale.depositing')}
                  </>
                ) : (
                  <>
                    <ArrowRight size={14} />
                    {t('presale.depositAndPlay')}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSuccessTx(null)}
                disabled={isDepositing}
                className="flex-1 rounded-xl border border-[var(--color-border)] px-3 py-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
              >
                {t('presale.depositLater')}
              </button>
            </div>
          )}

          {/* Deposit success */}
          {depositDone && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--color-success)]/15 px-3 py-2">
              <CheckCircle size={14} className="text-[var(--color-success)]" />
              <p className="text-xs font-bold text-[var(--color-success)]">{t('presale.depositSuccess')}</p>
            </div>
          )}
        </div>
      )}

      {/* Buy button */}
      {!isConnected ? (
        <button
          type="button"
          onClick={() => (window as any).__walletContext?.connect?.()}
          className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-4 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          {t('common.connectWallet')}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleBuy}
          disabled={!isEnabled || isBuying || axmAmount <= 0 || axmAmount > nativeHuman || coinOutput > coinAvailable}
          className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-4 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          {isBuying ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              {buyStep === 'signing' ? t('presale.stepSigning')
                : buyStep === 'broadcasting' ? t('presale.stepBroadcasting')
                : buyStep === 'confirming' ? t('presale.stepConfirming')
                : t('presale.buying')}
            </span>
          ) : axmAmount > nativeHuman ? (
            t('presale.insufficientAxm')
          ) : (
            t('presale.buy')
          )}
        </button>
      )}

      {/* Stats footer */}
      {!isLoading && (
        <div className="flex items-center justify-center gap-6 text-[10px] text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-1">
            <TrendingUp size={12} />
            <span className="flex items-center gap-0.5">{t('presale.totalRaised')}: {fmtNum(totalAxmRaised)} <AxmIcon size={10} /></span>
          </div>
          <div className="flex items-center gap-1">
            <Coins size={12} />
            <span>{t('presale.totalSold')}: {fmtNum(totalCoinSold)} COIN</span>
          </div>
        </div>
      )}

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
