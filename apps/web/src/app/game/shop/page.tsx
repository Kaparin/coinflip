'use client';

import { useState, useCallback, useMemo } from 'react';
import { Store, AlertTriangle, Sparkles, Coins } from 'lucide-react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGetVaultBalance } from '@coinflip/api-client';
import { GameTokenIcon, LaunchTokenIcon } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { API_URL, TREASURY_ADDRESS } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useTranslation } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { fromMicroLaunch } from '@coinflip/shared/constants';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { CHEST_TIERS, mergeTierConfig, type ChestTier } from './chest-config';
import Image from 'next/image';

export default function ShopPage() {
  const { t } = useTranslation();
  const { isConnected, address } = useWalletContext();
  const queryClient = useQueryClient();
  const { pendingDeduction } = usePendingBalance();

  // Vault balance (AXM)
  const { data: balanceData } = useGetVaultBalance({
    query: { enabled: isConnected },
  });
  const rawAvailable = BigInt(balanceData?.data?.available ?? '0');
  const adjusted = rawAvailable - pendingDeduction;
  const vaultBalanceHuman = fromMicroLaunch((adjusted < 0n ? 0n : adjusted).toString());

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

  // Per-tier purchase status
  const { data: purchaseStatus } = useQuery({
    queryKey: ['shop', 'purchase-status'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/shop/purchase-status`, {
        headers: { ...getAuthHeaders() },
        credentials: 'include',
      });
      if (!res.ok) return { purchasedTiers: {} as Record<number, number>, totalPurchases: 0 };
      const json = await res.json();
      return json.data as { purchasedTiers: Record<number, number>; totalPurchases: number };
    },
    enabled: isConnected,
    staleTime: 30_000,
  });

  const purchasedTiers = purchaseStatus?.purchasedTiers ?? {};

  // Modal states
  const [selectedTier, setSelectedTier] = useState<ChestTier | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    tier: ChestTier;
    coinAmount: number;
    bonusAmount: number;
  } | null>(null);

  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const refreshBalances = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/v1/vault/balance'] });
    queryClient.invalidateQueries({ queryKey: ['shop', 'purchase-status'] });
    queryClient.invalidateQueries({ queryKey: ['wallet-cw20-balance'] });
  }, [queryClient]);

  const handleBuy = useCallback(async (tier: ChestTier) => {
    if (!address || isBuying) return;

    setError(null);
    setIsBuying(true);

    try {
      const res = await fetch(`${API_URL}/api/v1/shop/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ chest_tier: tier.tier }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const code = errData?.error?.code;
        if (code === 'INSUFFICIENT_BALANCE') {
          throw new Error(t('shop.insufficientBalance'));
        }
        throw new Error(errData?.error?.message || 'Purchase failed');
      }

      const data = await res.json();
      const coinAmount = data.data?.coin_amount ?? tier.coinAmount;
      const bonusAmount = data.data?.bonus_amount ?? 0;

      setSelectedTier(null);
      setSuccessResult({ tier, coinAmount, bonusAmount });
      refreshBalances();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsBuying(false);
    }
  }, [address, isBuying, refreshBalances, t]);

  if (!TREASURY_ADDRESS) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-[var(--color-text-secondary)]">{t('shop.noTreasury')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6 pb-24 md:pb-6">
      {/* Page Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <Store size={22} className="text-[var(--color-primary)]" />
          <h1 className="text-xl font-extrabold">{t('shop.title')}</h1>
        </div>
      </div>

      {/* ─── COIN Section ─── */}
      <section className="space-y-4">
        {/* Section header */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/10">
            <Coins size={16} className="text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-sm font-bold">{t('shop.sectionCoin')}</h2>
            <p className="text-[11px] text-[var(--color-text-secondary)]">{t('shop.sectionCoinDesc')}</p>
          </div>
        </div>

        {/* Disabled notice */}
        {!configLoading && !isEnabled && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3">
            <AlertTriangle size={16} className="text-[var(--color-warning)] shrink-0" />
            <p className="text-xs font-medium text-[var(--color-warning)]">{t('shop.disabled')}</p>
          </div>
        )}

        {/* Error */}
        {error && !selectedTier && (
          <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3">
            <p className="text-xs text-[var(--color-danger)]">{error}</p>
          </div>
        )}

        {/* Loading */}
        {configLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
          </div>
        )}

        {/* Chest Grid */}
        {!configLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tiers.map((tier) => {
              const isFirstForTier = !purchasedTiers[tier.tier];
              const bonusAmount = isFirstForTier ? tier.coinAmount : 0;
              const canAfford = vaultBalanceHuman >= tier.axmPrice;

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
                  disabled={!isEnabled || isBuying}
                  className="relative flex flex-col items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-all hover:border-[var(--color-primary)]/40 hover:shadow-lg active:scale-[0.96] active:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer touch-manipulation"
                >
                  {/* Per-tier bonus badge */}
                  {isFirstForTier && bonusAmount > 0 && (
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

                  {/* Price — AXM with game token icon */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <GameTokenIcon size={14} />
                    <span className="text-lg font-extrabold">{tier.axmPrice} AXM</span>
                  </div>

                  {/* Insufficient balance warning */}
                  {isConnected && !canAfford && (
                    <p className="text-[9px] text-[var(--color-danger)] mt-1">{t('shop.notEnough')}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Purchase Confirmation Modal */}
      <Modal
        open={!!selectedTier && !successResult}
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
                  <GameTokenIcon size={14} />
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
              {!purchasedTiers[selectedTier.tier] && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-secondary)]">{t('shop.confirmBonus')}</span>
                  <span className="flex items-center gap-1 font-bold text-[var(--color-success)]">
                    <Sparkles size={14} />
                    +{fmtNum(selectedTier.coinAmount)} COIN
                  </span>
                </div>
              )}
            </div>

            {/* Info */}
            <p className="text-[11px] text-[var(--color-text-secondary)] text-center">
              {t('shop.confirmInfo')}
            </p>

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
                  <span className="animate-pulse">{t('shop.buying')}</span>
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

      {/* Success Modal — animated chest + congratulations */}
      <Modal
        open={!!successResult}
        onClose={() => setSuccessResult(null)}
        title={t('shop.congratulations')}
      >
        {successResult && (
          <div className="flex flex-col items-center gap-5 py-2">
            {/* Animated chest with glow */}
            <div className="relative">
              <div className="absolute -inset-6 rounded-full bg-[var(--color-primary)]/15 blur-2xl animate-pulse" />
              <div className="relative h-36 w-36 animate-bounce-slow">
                <Image
                  src={successResult.tier.image}
                  alt={t(successResult.tier.nameKey)}
                  fill
                  className="object-contain drop-shadow-[0_0_24px_rgba(99,102,241,0.4)]"
                  sizes="144px"
                />
              </div>
            </div>

            {/* Coin amount */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <LaunchTokenIcon size={24} />
                <span className="text-2xl font-black tabular-nums text-[var(--color-primary)]">
                  +{fmtNum(successResult.coinAmount + successResult.bonusAmount)} COIN
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('shop.received', { amount: fmtNum(successResult.coinAmount + successResult.bonusAmount) })}
              </p>
              {successResult.bonusAmount > 0 && (
                <div className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-3 py-1">
                  <Sparkles size={12} className="text-[var(--color-success)]" />
                  <span className="text-xs font-bold text-[var(--color-success)]">
                    +{fmtNum(successResult.bonusAmount)} COIN {t('shop.bonusLabel')}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSuccessResult(null)}
              className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3.5 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
            >
              {t('shop.continue')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
