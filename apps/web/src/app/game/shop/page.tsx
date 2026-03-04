'use client';

import { useState, useCallback } from 'react';
import { CheckCircle, ExternalLink, Loader2, Store, TrendingUp, Coins, AlertTriangle, Clock, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { useNativeBalance } from '@/hooks/use-wallet-balance';
import { usePresaleConfig, usePresaleStatus } from '@/hooks/use-presale';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { LaunchTokenIcon, AxmIcon } from '@/components/ui';
import { signPresaleBuy, signDepositTxBytes } from '@/lib/wallet-signer';
import { OnboardingModal } from '@/components/features/auth/onboarding-modal';
import { Modal } from '@/components/ui/modal';
import { PRESALE_CONTRACT, EXPLORER_URL, API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useTranslation } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { getUserFriendlyError } from '@/lib/user-friendly-errors';
import { CHEST_TIERS, type ChestTier } from './chest-config';
import Image from 'next/image';

type BuyStep = 'signing' | 'broadcasting' | 'confirming';

export default function ShopPage() {
  const { t } = useTranslation();
  const { isConnected, address, getWallet } = useWalletContext();
  const queryClient = useQueryClient();
  const { data: nativeBalance } = useNativeBalance(address);
  const { data: presaleConfig, isLoading: configLoading } = usePresaleConfig();
  const { data: presaleStatus, isLoading: statusLoading } = usePresaleStatus();
  const { data: grantStatus } = useGrantStatus();
  const oneClickEnabled = grantStatus?.authz_granted ?? false;

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
    coinAmount: string;
    axmAmount: string;
    bonusCredited: string;
    pending?: boolean;
  } | null>(null);

  // Post-purchase deposit flow
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<'signing' | 'broadcasting' | 'confirming' | null>(null);
  const [depositDone, setDepositDone] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const nativeHuman = Number(nativeBalance ?? '0') / 1_000_000;
  const rateNum = presaleStatus?.rate_num ?? 1;
  const rateDenom = presaleStatus?.rate_denom ?? 1;
  const coinAvailable = Number(presaleStatus?.coin_available ?? '0') / 1_000_000;
  const totalAxmRaised = Number(presaleConfig?.total_axm_received ?? '0') / 1_000_000;
  const totalCoinSold = Number(presaleConfig?.total_coin_sold ?? '0') / 1_000_000;
  const isEnabled = presaleStatus?.enabled ?? false;
  const isLoading = configLoading || statusLoading;

  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const getCoinForTier = (tier: ChestTier) => tier.axmPrice * rateNum / rateDenom;

  const refreshBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wallet-native-balance'] });
    queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
    queryClient.invalidateQueries({ queryKey: ['presale'] });
    queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
    queryClient.invalidateQueries({ queryKey: ['shop', 'purchase-status'] });
  }, [queryClient]);

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
    const coinOutput = getCoinForTier(tier);

    setError(null);
    setSuccessTx(null);
    setDepositDone(false);
    setIsBuying(true);
    setBuyStep('signing');

    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');

      const result = await signPresaleBuy(wallet, address, String(microAxm), (step) => {
        setBuyStep(step);
      });

      const microCoin = String(Math.floor(coinOutput * 1_000_000));

      // Confirm purchase on backend
      let bonusCredited = '0';
      try {
        const confirmRes = await fetch(`${API_URL}/api/v1/shop/confirm-purchase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          credentials: 'include',
          body: JSON.stringify({
            tx_hash: result.txHash,
            chest_tier: tier.tier,
            axm_amount: String(microAxm),
            coin_amount: microCoin,
          }),
        });
        if (confirmRes.ok) {
          const confirmData = await confirmRes.json();
          bonusCredited = confirmData.data?.bonus_credited ?? '0';
        }
      } catch {
        // Non-critical — purchase still happened on-chain
      }

      const bonusHuman = Number(bonusCredited) / 1_000_000;

      if (result.timedOut) {
        setSuccessTx({
          txHash: result.txHash,
          coinAmount: fmtNum(coinOutput),
          axmAmount: fmtNum(tier.axmPrice),
          bonusCredited: fmtNum(bonusHuman),
          pending: true,
        });
      } else {
        setSuccessTx({
          txHash: result.txHash,
          coinAmount: fmtNum(coinOutput),
          axmAmount: fmtNum(tier.axmPrice),
          bonusCredited: fmtNum(bonusHuman),
        });
      }

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
  }, [address, isBuying, getWallet, refreshBalances, t, rateNum, rateDenom]);

  if (!PRESALE_CONTRACT) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-[var(--color-text-secondary)]">{t('presale.noContract')}</p>
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

      {/* Stats bar */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center">
            <p className="text-[10px] text-[var(--color-text-secondary)]">{t('presale.rate')}</p>
            <p className="text-sm font-bold text-[var(--color-primary)]">1:{rateNum / rateDenom}</p>
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

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3">
          <p className="text-xs text-[var(--color-danger)]">{error}</p>
        </div>
      )}

      {/* Success card */}
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
              {successTx.pending ? t('presale.pendingTitle') : t('shop.chestOpened')}
            </p>
          </div>
          <div className="text-[10px] text-[var(--color-text-secondary)] space-y-0.5">
            <p>{t('shop.received', { amount: successTx.coinAmount })}</p>
            {successTx.bonusCredited !== '0' && (
              <p className="text-[var(--color-success)] font-bold">
                +{successTx.bonusCredited} COIN {t('shop.bonusLabel')}
              </p>
            )}
          </div>
          <a
            href={`${EXPLORER_URL}/transactions/${successTx.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary)] hover:underline"
          >
            {t('presale.txHash')} <ExternalLink size={10} />
          </a>

          {/* Auto-deposit buttons */}
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

          {depositDone && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--color-success)]/15 px-3 py-2">
              <CheckCircle size={14} className="text-[var(--color-success)]" />
              <p className="text-xs font-bold text-[var(--color-success)]">{t('presale.depositSuccess')}</p>
            </div>
          )}
        </div>
      )}

      {/* Chest Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CHEST_TIERS.map((tier) => {
          const coinAmount = getCoinForTier(tier);
          const bonusAmount = !hasFirstPurchase ? coinAmount : 0;
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
              disabled={!isEnabled || isBuying || (isConnected && !canAfford) || coinAmount > coinAvailable}
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
                  {fmtNum(coinAmount)} COIN
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

      {/* First purchase banner */}
      {!hasFirstPurchase && isConnected && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 px-4 py-3">
          <Sparkles size={16} className="text-[var(--color-warning)] shrink-0" />
          <p className="text-[11px] font-medium text-[var(--color-warning)]">{t('shop.firstPurchaseBanner')}</p>
        </div>
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
                  {fmtNum(getCoinForTier(selectedTier))} COIN
                </span>
              </div>
              {!hasFirstPurchase && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-secondary)]">{t('shop.confirmBonus')}</span>
                  <span className="flex items-center gap-1 font-bold text-[var(--color-success)]">
                    <Sparkles size={14} />
                    +{fmtNum(getCoinForTier(selectedTier))} COIN
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
                      : buyStep === 'confirming' ? t('presale.stepConfirming')
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

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
