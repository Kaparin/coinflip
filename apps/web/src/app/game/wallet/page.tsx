'use client';

import { Wallet } from 'lucide-react';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { BalanceDisplay } from '@/components/features/vault/balance-display';
import { StatusChips } from '@/components/features/auth/status-chips';
import { OnboardingModal } from '@/components/features/auth/onboarding-modal';
import { UserAvatar } from '@/components/ui';
import { useState, useCallback } from 'react';
import { EXPLORER_URL } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';

export default function WalletPage() {
  const { t } = useTranslation();
  const { address, isConnected, connect, savedWallets, openConnectModal } = useWalletContext();
  const { data: grantData } = useGrantStatus();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const oneClickEnabled = grantData?.authz_granted ?? false;
  const gasSponsored = (grantData?.fee_grant_active ?? false) || (grantData?.user_fee_grant_active ?? false);

  const handleCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center pb-24 md:pb-6">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
          <Wallet size={48} strokeWidth={1} className="mx-auto mb-4 text-[var(--color-text-secondary)]" />
          <h2 className="text-lg font-bold mb-2">{t('walletPage.connectTitle')}</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {t('walletPage.connectDesc')}
          </p>
          <button type="button" onClick={connect}
            className="rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)]">
            {t('common.connectWallet')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-24 md:pb-6">
      {/* Address card */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('profile.connected')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleCopy}
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[10px] font-medium hover:bg-[var(--color-surface-hover)] transition-colors">
              {copied ? t('common.copied') : t('common.copy')}
            </button>
            <a href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[10px] font-medium hover:bg-[var(--color-surface-hover)] transition-colors">
              {t('common.explorer')}
            </a>
          </div>
        </div>
        <p className="text-xs font-mono break-all leading-relaxed text-[var(--color-text-secondary)]">{address}</p>
      </div>

      {/* Saved wallets — switch between them */}
      {savedWallets.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">
            {t('header.savedWallets')}
          </p>
          <div className="space-y-2">
            {savedWallets.map((w) => {
              const addr = typeof w.address === 'string' ? w.address : '';
              if (!addr) return null;
              const isCurrent = address === addr;
              return (
                <button
                  key={addr}
                  type="button"
                  onClick={() => {
                    if (isCurrent) return;
                    openConnectModal(addr);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-left transition-colors hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-border)]/10"
                >
                  <UserAvatar address={addr} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono truncate">
                      {`${addr.slice(0, 12)}...${addr.slice(-8)}`}
                      {isCurrent && (
                        <span className="ml-1.5 text-[10px] text-[var(--color-success)] font-normal">
                          ({t('auth.current')})
                        </span>
                      )}
                    </p>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => openConnectModal()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
            >
              <Wallet size={18} />
              {t('auth.addNewWallet')}
            </button>
          </div>
        </div>
      )}

      {/* Full Balance Display with deposit/withdraw */}
      <BalanceDisplay />

      {/* Status chips */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">{t('gameStatus.title')}</p>
        <StatusChips
          oneClickEnabled={oneClickEnabled}
          gasSponsored={gasSponsored}
          onSetupClick={() => setOnboardingOpen(true)}
        />
      </div>

      <OnboardingModal isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  );
}
