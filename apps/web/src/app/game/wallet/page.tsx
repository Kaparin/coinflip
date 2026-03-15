'use client';

import { Wallet, ArrowLeft, ChevronDown, Check, Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useWalletContext } from '@/contexts/wallet-context';
import { Button } from '@/components/ui/button';
import { BalanceDisplay } from '@/components/features/vault/balance-display';
import { StakingWidget } from '@/components/features/staking/staking-widget';
import { UserAvatar } from '@/components/ui';
import { useState, useCallback } from 'react';
import { EXPLORER_URL } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';

export default function WalletPage() {
  const { t } = useTranslation();
  const { address, isConnected, connect, savedWallets, openConnectModal } = useWalletContext();
  const [copied, setCopied] = useState(false);
  const [showSavedWallets, setShowSavedWallets] = useState(false);

  const handleCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  if (!isConnected) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 lg:px-6 py-4 pb-24 md:pb-6">
          {/* Back button */}
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/game"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-lg font-bold">{t('walletPage.title')}</h1>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
            <Wallet size={48} strokeWidth={1} className="mx-auto mb-4 text-[var(--color-text-secondary)]" />
            <h2 className="text-lg font-bold mb-2">{t('walletPage.connectTitle')}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              {t('walletPage.connectDesc')}
            </p>
            <Button variant="primary" size="lg" onClick={connect}>
              <Wallet size={16} />
              {t('common.connectWallet')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-4 space-y-4 pb-24 md:pb-6">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <Link
            href="/game"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-lg font-bold">{t('walletPage.title')}</h1>
        </div>

        {/* Address card */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('profile.connected')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="xs" onClick={handleCopy} success={copied}>
                {copied ? <><Check size={12} /> {t('common.copied')}</> : <><Copy size={12} /> {t('common.copy')}</>}
              </Button>
              <a href={`${EXPLORER_URL}/address/${address}`} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="xs" className="pointer-events-none">
                  <ExternalLink size={12} /> {t('common.explorer')}
                </Button>
              </a>
            </div>
          </div>
          <p className="text-xs font-mono break-all leading-relaxed text-[var(--color-text-secondary)]">{address}</p>
        </div>

        {/* Full Balance Display with deposit/withdraw — TOP PRIORITY */}
        <BalanceDisplay />

        {/* LAUNCH Staking */}
        <StakingWidget />

        {/* Saved wallets — collapsible, hidden by default */}
        {savedWallets.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <button
              type="button"
              onClick={() => setShowSavedWallets(prev => !prev)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {t('header.savedWallets')}
              </p>
              <ChevronDown
                size={16}
                className={`text-[var(--color-text-secondary)] transition-transform duration-200 ${showSavedWallets ? 'rotate-180' : ''}`}
              />
            </button>

            <div className="collapsible-content" data-open={showSavedWallets}>
              <div className="px-4 pb-4 space-y-2">
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
                <Button variant="ghost" size="md" onClick={() => openConnectModal()} className="w-full border-dashed border border-[var(--color-border)] text-[var(--color-primary)]">
                  <Wallet size={16} />
                  {t('auth.addNewWallet')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
