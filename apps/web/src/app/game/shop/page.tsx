'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { CheckCircle, ExternalLink, Loader2, Store, AlertTriangle, ArrowRight, Sparkles, ShieldCheck, XCircle } from 'lucide-react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { useNativeBalance } from '@/hooks/use-wallet-balance';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { useWebSocketContext } from '@/contexts/websocket-context';
import { LaunchTokenIcon, AxmIcon } from '@/components/ui';
import { signBankSendSync, signDepositTxBytes } from '@/lib/wallet-signer';
import { OnboardingModal } from '@/components/features/auth/onboarding-modal';
import { Modal } from '@/components/ui/modal';
import { EXPLORER_URL, API_URL, TREASURY_ADDRESS } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useTranslation } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { getUserFriendlyError } from '@/lib/user-friendly-errors';
import { CHEST_TIERS, mergeTierConfig, type ChestTier } from './chest-config';
import Image from 'next/image';

type BuyStep = 'signing' | 'broadcasting';

export default function ShopPage() {
  const { t } = useTranslation();
  const { isConnected, address, getWallet } = useWalletContext();
  const queryClient = useQueryClient();
  const { data: nativeBalance } = useNativeBalance(address);
  const { data: grantStatus } = useGrantStatus();
  const oneClickEnabled = grantStatus?.authz_granted ?? false;

  // Load tier config from server
  const { data: shopConfig, isLoading: configLoading } = useQuery({
    queryKey: ['shop', 'config'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/shop/config`);
      if (!res.ok) return { tiers: [], enabled: false };
      const json = await res.json();
      return json.data as { tiers: Array<{ tier: number; axmPrice: number; coinAmount: number }>; enabled: boolean };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const isEnabled = shopConfig?.enabled ?? false;
  const tiers = useMemo(
    () => shopConfig?.tiers?.length ? mergeTierConfig(shopConfig.tiers) : CHEST_TIERS,
    [shopConfig?.tiers],
  );

  // Shop purchase status
  const { data: purchaseStatus } = useQuery({
    queryKey: ['shop', 'purchase-status'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/shop/purchase-status`, {
        headers: { ...getAuthHeaders() },
        credentials: 'include',
      });
      if (!res.ok) return { hasFirstPurchase: false, totalPurchases: 0 };
      const json = await res.json();
      return json.data as { hasFirstPurchase: boolean; totalPurchases: number };
    },
    enabled: isConnected,
    staleTime: 30_000,
  });

  const hasFirstPurchase = purchaseStatus?.hasFirstPurchase ?? false;

  // Confirmation modal state
  const [selectedTier, setSelectedTier] = useState<ChestTier | null>(null);

  const [isBuying, setIsBuying] = useState(false);
  const [buyStep, setBuyStep] = useState<BuyStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successTx, setSuccessTx] = useState<{
    txHash: string;
    coinAmount: number;
    bonusAmount: number;
  } | null>(null);

  // Purchase failure modal (from WS event)
  const [purchaseFailure, setPurchaseFailure] = useState<{
    txHash: string;
    reason: string;
  } | null>(null);

  // Post-purchase deposit flow
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<'signing' | 'broadcasting' | 'confirming' | null>(null);
  const [depositDone, setDepositDone] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const nativeHuman = Number(nativeBalance ?? '0') / 1_000_000;

  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const refreshBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wallet-native-balance'] });
    queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
    queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
    queryClient.invalidateQueries({ queryKey: ['shop', 'purchase-status'] });
    queryClient.invalidateQueries({ queryKey: ['shop', 'config'] });
  }, [queryClient]);

  // WS listeners for background purchase confirmation
  const { subscribe } = useWebSocketContext();

  useEffect(() => {
    const unsub = subscribe((event) => {
      if (event.type === 'purchase_confirmed') {
        const data = event.data as { coin_amount?: string; coin_tx_hash?: string };
        // Auto-trigger deposit after COIN arrives on wallet
        setSuccessTx((prev) => {
          if (prev) {
            return { ...prev, coinAmount: Number(data.coin_amount ?? prev.coinAmount) };
          }
          return prev;
        });
        refreshBalances();
      } else if (event.type === 'purchase_failed') {
        const data = event.data as { tx_hash?: string; reason?: string };
        setPurchaseFailure({
          txHash: data.tx_hash ?? '',
          reason: data.reason ?? '',
        });
        refreshBalances();
      }
    });
    return unsub;
  }, [subscribe, refreshBalances]);

  const handleDeposit = useCallback(async () => {
    if (!address || !successTx || isDepositing) return;
    const coinAmount = successTx.coinAmount;
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

  const handleBuy = useCallback(async (tier: ChestTier) => {
    if (!address || isBuying) return;

    const microAxm = Math.floor(tier.axmPrice * 1_000_000);

    setError(null);
    setSuccessTx(null);
    setDepositDone(false);
    setIsBuying(true);
    setBuyStep('signing');

    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');

      // Sign bank.MsgSend(AXM → treasury) + broadcast_tx_sync
      const { txHash } = await signBankSendSync(
        wallet, address, String(microAxm),
        (step) => setBuyStep(step),
      );

      // Tell server about the purchase — server verifies tx + sends real COIN
      let isFirstPurchase = false;
      try {
        const res = await fetch(`${API_URL}/api/v1/shop/instant-buy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          credentials: 'include',
          body: JSON.stringify({
            tx_hash: txHash,
            chest_tier: tier.tier,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          isFirstPurchase = data.data?.is_first_purchase ?? false;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || 'Server rejected purchase');
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'Server rejected purchase') throw err;
        // Non-critical — tx is already in mempool
      }

      const bonusAmount = isFirstPurchase ? tier.coinAmount : 0;

      setSuccessTx({
        txHash,
        coinAmount: tier.coinAmount + bonusAmount,
        bonusAmount,
      });

      // Close confirmation modal on success
      setSelectedTier(null);
      refreshBalances();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(getUserFriendlyError(msg, t, 'generic'));
      refreshBalances();
    } finally {
      setIsBuying(false);
      setBuyStep(null);
    }
  }, [address, isBuying, getWallet, refreshBalances, t]);

  if (!TREASURY_ADDRESS) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-[var(--color-text-secondary)]">{t('shop.noTreasury')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <Store size={24} className="text-[var(--color-primary)]" />
          <h1 className="text-xl font-extrabold">{t('shop.title')}</h1>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">{t('shop.subtitle')}</p>
      </div>

      {/* Loading */}
      {configLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      )}

      {/* Disabled notice */}
      {!configLoading && !isEnabled && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3">
          <AlertTriangle size={16} className="text-[var(--color-warning)] shrink-0" />
          <p className="text-xs font-medium text-[var(--color-warning)]">{t('shop.disabled')}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3">
          <p className="text-xs text-[var(--color-danger)]">{error}</p>
        </div>
      )}

      {/* Success card — COIN is being sent / was sent */}
      {successTx && (
        <div className="rounded-xl border px-4 py-3 space-y-3 border-[var(--color-success)]/30 bg-[var(--color-success)]/10">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-[var(--color-success)]" />
            <p className="text-xs font-bold text-[var(--color-success)]">
              {t('shop.instantSuccess')}
            </p>
          </div>
          <div className="text-[10px] text-[var(--color-text-secondary)] space-y-0.5">
            <p>{t('shop.received', { amount: fmtNum(successTx.coinAmount) })}</p>
            {successTx.bonusAmount > 0 && (
              <p className="text-[var(--color-success)] font-bold">
                +{fmtNum(successTx.bonusAmount)} COIN {t('shop.bonusLabel')}
              </p>
            )}
          </div>
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            {t('shop.coinSending')}
          </p>
          <a
            href={`${EXPLORER_URL}/transactions/${successTx.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] hover:underline"
          >
            {t('presale.txHash')} <ExternalLink size={10} />
          </a>

          {/* Auto-deposit buttons */}
          {!depositDone && (
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

          {depositDone && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--color-success)]/15 px-3 py-2">
              <CheckCircle size={14} className="text-[var(--color-success)]" />
              <p className="text-xs font-bold text-[var(--color-success)]">{t('presale.depositSuccess')}</p>
            </div>
          )}
        </div>
      )}

      {/* Chest Grid */}
      {!configLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiers.map((tier) => {
            const bonusAmount = !hasFirstPurchase ? tier.coinAmount : 0;
            const canAfford = nativeHuman >= tier.axmPrice;

            return (
              <button
                key={tier.tier}
                type="button"
                onClick={() => {
                  if (!isConnected) {
                    (window as any).__walletContext?.connect?.();
                    return;
                  }
                  setError(null);
                  setSelectedTier(tier);
                }}
                disabled={!isEnabled || isBuying || (isConnected && !canAfford)}
                className="relative flex flex-col items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-all hover:border-[var(--color-primary)]/40 hover:shadow-lg active:scale-[0.96] active:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer touch-manipulation"
              >
                {/* Bonus badge */}
                {!hasFirstPurchase && bonusAmount > 0 && (
                  <div className="absolute -top-2 -right-2 z-10 rounded-lg bg-[var(--color-success)] px-2 py-0.5 text-[9px] font-extrabold text-white shadow-md">
                    +{fmtNum(bonusAmount)}
                  </div>
                )}
                {tier.label === 'popular' && (
                  <div className="absolute -top-2 -left-2 z-10 rounded-lg bg-[var(--color-primary)] px-2 py-0.5 text-[9px] font-extrabold text-white shadow-md">
                    {t('shop.popular')}
                  </div>
                )}
                {tier.label === 'bestValue' && (
                  <div className="absolute -top-2 -left-2 z-10 rounded-lg bg-[var(--color-success)] px-2 py-0.5 text-[9px] font-extrabold text-white shadow-md">
                    {t('shop.bestValue')}
                  </div>
                )}

                {/* COIN amount — top */}
                <div className="flex items-center gap-1 mt-1">
                  <LaunchTokenIcon size={16} />
                  <p className="text-lg font-extrabold text-[var(--color-primary)] leading-tight">
                    {fmtNum(tier.coinAmount)} COIN
                  </p>
                </div>

                {/* Image */}
                <div className="relative h-20 w-20 my-2">
                  <Image
                    src={tier.image}
                    alt={t(tier.nameKey)}
                    fill
                    className="object-contain drop-shadow-lg"
                    sizes="80px"
                  />
                </div>

                {/* Name */}
                <p className="text-[11px] font-bold text-[var(--color-text-secondary)] text-center leading-tight">{t(tier.nameKey)}</p>

                {/* Price — large with AXM icon */}
                <div className="mt-1 flex items-center gap-1.5">
                  <AxmIcon size={18} />
                  <span className="text-lg font-extrabold">{tier.axmPrice} AXM</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* First purchase banner */}
      {!hasFirstPurchase && isConnected && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-3">
          <Sparkles size={16} className="text-[var(--color-warning)] shrink-0" />
          <p className="text-[11px] font-medium text-[var(--color-warning)]">{t('shop.firstPurchaseBanner')}</p>
        </div>
      )}

      {/* Purchase Confirmation Modal */}
      <Modal
        open={!!selectedTier}
        onClose={() => !isBuying && setSelectedTier(null)}
        title={t('shop.confirmTitle')}
        showCloseButton={!isBuying}
      >
        {selectedTier && (
          <div className="space-y-4">
            {/* Chest preview */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative h-28 w-28">
                <Image
                  src={selectedTier.image}
                  alt={t(selectedTier.nameKey)}
                  fill
                  className="object-contain drop-shadow-xl"
                  sizes="112px"
                />
              </div>
              <h3 className="text-base font-extrabold">{t(selectedTier.nameKey)}</h3>
            </div>

            {/* Details */}
            <div className="space-y-2 rounded-xl bg-[var(--color-bg)] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-secondary)]">{t('shop.confirmPrice')}</span>
                <span className="flex items-center gap-1 font-bold">
                  <AxmIcon size={14} />
                  {selectedTier.axmPrice} AXM
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-secondary)]">{t('shop.confirmReceive')}</span>
                <span className="flex items-center gap-1 font-bold text-[var(--color-primary)]">
                  <LaunchTokenIcon size={14} />
                  {fmtNum(selectedTier.coinAmount)} COIN
                </span>
              </div>
              {!hasFirstPurchase && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-secondary)]">{t('shop.confirmBonus')}</span>
                  <span className="flex items-center gap-1 font-bold text-[var(--color-success)]">
                    <Sparkles size={14} />
                    +{fmtNum(selectedTier.coinAmount)} COIN
                  </span>
                </div>
              )}
            </div>

            {/* Info about crediting */}
            <div className="flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
              <ShieldCheck size={16} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
              <div className="text-[11px] text-[var(--color-text-secondary)] space-y-1">
                <p>{t('shop.confirmInfo')}</p>
                {!hasFirstPurchase && (
                  <p className="text-[var(--color-success)] font-medium">{t('shop.confirmBonusInfo')}</p>
                )}
              </div>
            </div>

            {/* Error in modal */}
            {error && (
              <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2">
                <p className="text-xs text-[var(--color-danger)]">{error}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleBuy(selectedTier)}
                disabled={isBuying}
                className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3.5 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] disabled:opacity-70 active:scale-[0.98]"
              >
                {isBuying ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {buyStep === 'signing' ? t('presale.stepSigning')
                      : buyStep === 'broadcasting' ? t('presale.stepBroadcasting')
                      : t('presale.buying')}
                  </>
                ) : (
                  t('shop.confirmBuy', { price: `${selectedTier.axmPrice} AXM` })
                )}
              </button>
              {!isBuying && (
                <button
                  type="button"
                  onClick={() => setSelectedTier(null)}
                  className="flex-1 rounded-xl border border-[var(--color-border)] px-3 py-3.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Purchase Failed Modal (from WS background confirmation) */}
      <Modal
        open={!!purchaseFailure}
        onClose={() => setPurchaseFailure(null)}
        title={t('shop.purchaseFailedTitle')}
      >
        {purchaseFailure && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <XCircle size={20} className="text-[var(--color-danger)]" />
              <p className="text-sm font-bold text-[var(--color-danger)]">{t('shop.purchaseFailedTitle')}</p>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {t('shop.purchaseFailedDetail')}
            </p>
            {purchaseFailure.txHash && (
              <a
                href={`${EXPLORER_URL}/transactions/${purchaseFailure.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] hover:underline"
              >
                {t('presale.txHash')} <ExternalLink size={10} />
              </a>
            )}
            <button
              type="button"
              onClick={() => setPurchaseFailure(null)}
              className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
            >
              {t('shop.purchaseFailedOk')}
            </button>
          </div>
        )}
      </Modal>

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
