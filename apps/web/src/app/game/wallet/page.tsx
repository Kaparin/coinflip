'use client';

import { useWalletContext } from '@/contexts/wallet-context';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { BalanceDisplay } from '@/components/features/vault/balance-display';
import { StatusChips } from '@/components/features/auth/status-chips';
import { OnboardingModal } from '@/components/features/auth/onboarding-modal';
import { useState, useCallback } from 'react';
import { EXPLORER_URL } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';

export default function WalletPage() {
  const { t } = useTranslation();
  const { address, isConnected, connect, shortAddress } = useWalletContext();
  const { data: grantData } = useGrantStatus();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const oneClickEnabled = grantData?.authz_granted ?? false;
  const gasSponsored = grantData?.fee_grant_active ?? false;

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
          <svg className="h-12 w-12 mx-auto mb-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6zm0 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6" />
          </svg>
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
            <a href={`${EXPLORER_URL}/account/${address}`} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[10px] font-medium hover:bg-[var(--color-surface-hover)] transition-colors">
              {t('common.explorer')}
            </a>
          </div>
        </div>
        <p className="text-xs font-mono break-all leading-relaxed text-[var(--color-text-secondary)]">{address}</p>
      </div>

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
