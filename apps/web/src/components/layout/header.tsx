'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Puzzle, User, ShieldCheck, ChevronDown, Copy, ExternalLink, Languages, LogOut, Trash2, X, Menu, Wallet, Trophy } from 'lucide-react';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { useGetVaultBalance, useGetActiveEvents } from '@coinflip/api-client';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { StatusChips } from '@/components/features/auth/status-chips';
import { OnboardingModal } from '@/components/features/auth/onboarding-modal';
import { fromMicroLaunch } from '@coinflip/shared/constants';
import { ADMIN_ADDRESS, EXPLORER_URL } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { isWsConnected, POLL_INTERVAL_WS_CONNECTED, POLL_INTERVAL_WS_DISCONNECTED } from '@/hooks/use-websocket';

export function Header() {
  const { t, locale, setLocale } = useTranslation();
  const pathname = usePathname();
  const wallet = useWalletContext();
  const { data: grantData } = useGrantStatus();
  const { data: balanceData } = useGetVaultBalance({
    query: {
      enabled: wallet.isConnected,
      refetchInterval: () => isWsConnected() ? POLL_INTERVAL_WS_CONNECTED : POLL_INTERVAL_WS_DISCONNECTED,
    },
  });
  const { data: activeEventsData } = useGetActiveEvents({
    query: { staleTime: 60_000, refetchInterval: 120_000 },
  });
  const activeEventCount = (activeEventsData as unknown as { data?: unknown[] })?.data?.length ?? 0;
  const { data: walletBalanceRaw } = useWalletBalance(wallet.address);
  const { pendingDeduction } = usePendingBalance();
  const [menuOpen, setMenuOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const balance = balanceData?.data;
  const rawAvailable = BigInt(balance?.available ?? '0');
  const adjusted = rawAvailable - pendingDeduction;
  const availableHuman = fromMicroLaunch((adjusted < 0n ? 0n : adjusted).toString());
  const walletBalanceHuman = fromMicroLaunch(walletBalanceRaw ?? '0');
  const oneClickEnabled = grantData?.authz_granted ?? false;
  const gasSponsored = grantData?.fee_grant_active ?? false;

  const isAdmin =
    wallet.isConnected &&
    !!wallet.address &&
    !!ADMIN_ADDRESS &&
    wallet.address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  const fmtBal = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  // Close dropdown on click outside
  useEffect(() => {
    if (!walletDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWalletDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [walletDropdownOpen]);

  const handleCopyAddress = useCallback(() => {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [wallet.address]);

  const handleDisconnect = useCallback(() => {
    wallet.disconnect();
    setWalletDropdownOpen(false);
    setMenuOpen(false);
  }, [wallet]);

  const handleForgetWallet = useCallback(() => {
    const addr = wallet.address ?? undefined;
    setWalletDropdownOpen(false);
    setMenuOpen(false);
    wallet.forgetWallet(addr);
  }, [wallet]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/game" className="flex items-center gap-2.5 group">
            <span className="text-lg font-extrabold tracking-tight">
              Heads or <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Tails</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-3 md:flex">
            {wallet.isConnected && (
              <>
                {/* Balance display */}
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-1.5" title={t('header.vaultTitle')}>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">{t('header.vault')}</span>
                    <span className="flex items-center gap-1.5 font-bold tabular-nums text-[var(--color-success)]">{fmtBal(availableHuman)} <LaunchTokenIcon size={40} /></span>
                  </div>
                  <div className="flex items-center gap-1.5" title={t('header.walletTitle')}>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">{t('header.wallet')}</span>
                    <span className="flex items-center gap-1.5 font-bold tabular-nums">{fmtBal(walletBalanceHuman)} <LaunchTokenIcon size={40} /></span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-[var(--color-border)]" />

                {/* Desktop page links */}
                <nav className="flex items-center gap-1">
                  <Link href="/game"
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      pathname === '/game'
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                    }`}>
                    <Puzzle size={14} />
                    {t('nav.play')}
                  </Link>
                  <Link href="/game/profile"
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      pathname?.startsWith('/game/profile')
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                    }`}>
                    <User size={14} />
                    {t('nav.profile')}
                  </Link>
                  <Link href="/game/events"
                    className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      pathname?.startsWith('/game/events')
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                    }`}>
                    <Trophy size={14} />
                    {t('nav.events')}
                    {activeEventCount > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-warning)] px-1 text-[9px] font-bold text-white">
                        {activeEventCount}
                      </span>
                    )}
                  </Link>
                </nav>

                <StatusChips
                  oneClickEnabled={oneClickEnabled}
                  gasSponsored={gasSponsored}
                  compact
                  onSetupClick={() => setOnboardingOpen(true)}
                />
              </>
            )}

            {isAdmin && (
              <Link href="/admin"
                className="flex items-center gap-1.5 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20">
                <ShieldCheck size={14} />
                {t('common.admin')}
              </Link>
            )}

            {wallet.isConnected ? (
              <div className="relative" ref={dropdownRef}>
                <button type="button" onClick={() => setWalletDropdownOpen(!walletDropdownOpen)}
                  className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]">
                  {wallet.address && <UserAvatar address={wallet.address} size={24} />}
                  <span className="font-mono text-xs">{wallet.shortAddress ?? ''}</span>
                  <ChevronDown size={12} className={`text-[var(--color-text-secondary)] transition-transform ${walletDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Wallet dropdown */}
                {walletDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden animate-fade-in z-50">
                    {/* Profile header */}
                    <div className="px-4 py-3 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-3">
                        {wallet.address && <UserAvatar address={wallet.address} size={36} />}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono break-all leading-relaxed">{wallet.address}</p>
                        </div>
                      </div>
                    </div>

                    {/* Navigation links */}
                    <div className="py-1 border-b border-[var(--color-border)]">
                      <Link href="/game/profile" onClick={() => setWalletDropdownOpen(false)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-[var(--color-surface-hover)]">
                        <User size={16} className="text-[var(--color-text-secondary)]" />
                        <span>{t('nav.profile')}</span>
                      </Link>

                      {/* Copy address */}
                      <button type="button" onClick={handleCopyAddress}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-[var(--color-surface-hover)]">
                        <Copy size={16} className="text-[var(--color-text-secondary)]" />
                        <span>{copied ? t('common.copied') : t('header.copyAddress')}</span>
                      </button>

                      {/* View in explorer */}
                      {wallet.address && (
                      <a href={`${EXPLORER_URL}/address/${wallet.address}`} target="_blank" rel="noopener noreferrer"
                        onClick={() => setWalletDropdownOpen(false)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-[var(--color-surface-hover)]">
                        <ExternalLink size={16} className="text-[var(--color-text-secondary)]" />
                        <span>{t('header.viewInExplorer')}</span>
                      </a>
                      )}

                      {/* Admin link (if admin) */}
                      {isAdmin && (
                        <Link href="/admin" onClick={() => setWalletDropdownOpen(false)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-xs text-[var(--color-primary)] transition-colors hover:bg-[var(--color-surface-hover)]">
                          <ShieldCheck size={16} />
                          <span>{t('header.adminPanel')}</span>
                        </Link>
                      )}
                    </div>

                    {/* Language switcher */}
                    <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-2">
                        <Languages size={16} className="text-[var(--color-text-secondary)]" />
                        <div className="flex flex-1 rounded-lg bg-[var(--color-bg)] p-0.5 text-[10px] font-bold">
                          <button type="button" onClick={() => setLocale('en')}
                            className={`flex-1 rounded-md px-2.5 py-1.5 transition-colors ${locale === 'en' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}>
                            EN
                          </button>
                          <button type="button" onClick={() => setLocale('ru')}
                            className={`flex-1 rounded-md px-2.5 py-1.5 transition-colors ${locale === 'ru' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}>
                            RU
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Saved wallets — quick switch + manage */}
                    <div className="py-1 border-b border-[var(--color-border)]">
                      {wallet.savedWallets.length > 1 && (
                        <>
                          <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                            {t('header.savedWallets')}
                          </p>
                          {wallet.savedWallets.map((w) => {
                            const addr = typeof w.address === 'string' ? w.address : '';
                            const isCurrent = wallet.address === addr;
                            return (
                              <button
                                key={addr || w.address}
                                type="button"
                                onClick={() => {
                                  if (isCurrent) {
                                    setWalletDropdownOpen(false);
                                    return;
                                  }
                                  wallet.openConnectModal(addr);
                                  setWalletDropdownOpen(false);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-[var(--color-surface-hover)] text-left"
                              >
                                {addr && <UserAvatar address={addr} size={24} />}
                                <span className="font-mono truncate flex-1 min-w-0">
                                  {addr ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : '...'}
                                  {isCurrent && (
                                    <span className="ml-1 text-[var(--color-success)]">({t('auth.current')})</span>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </>
                      )}
                      <button type="button" onClick={() => { wallet.openConnectModal(); setWalletDropdownOpen(false); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]">
                        <Wallet size={16} />
                        <span>{t('header.manageWallets')}</span>
                      </button>
                    </div>

                    {/* Disconnect / Forget */}
                    <div className="py-1">
                      <button type="button" onClick={handleDisconnect}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs text-[var(--color-warning)] transition-colors hover:bg-[var(--color-surface-hover)]">
                        <LogOut size={16} />
                        <span>{t('header.disconnect')}</span>
                      </button>

                      <button type="button" onClick={handleForgetWallet}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--color-surface-hover)]">
                        <Trash2 size={16} />
                        <span>{t('header.forgetWallet')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" onClick={wallet.connect} disabled={wallet.isConnecting}
                className="rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
                {wallet.isConnecting ? t('common.connecting') : t('common.connectWallet')}
              </button>
            )}
          </div>

          {/* Mobile: Connect button when disconnected, else 1-Click chip + burger */}
          <div className="flex items-center gap-1.5 md:hidden min-w-0">
            {wallet.isConnected ? (
              <>
                <div className="min-w-0 overflow-hidden">
                  <StatusChips
                    oneClickEnabled={oneClickEnabled}
                    gasSponsored={gasSponsored}
                    compact
                    onSetupClick={() => setOnboardingOpen(true)}
                  />
                </div>
                <button type="button" onClick={() => setMenuOpen(!menuOpen)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
                  aria-label={t('header.toggleMenu')}>
                  {menuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </>
            ) : (
              <button type="button" onClick={wallet.connect} disabled={wallet.isConnecting}
                className="rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
                {wallet.isConnecting ? t('common.connecting') : t('common.connectWallet')}
              </button>
            )}
          </div>
        </div>

        {/* Mobile dropdown — address + actions (only when connected; Connect is in header when disconnected) */}
        {menuOpen && wallet.isConnected && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:hidden">
            <div className="flex flex-col gap-2.5">
              {/* Compact address row */}
              <div className="flex items-center justify-between rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] px-3 py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-success)]" />
                  <span className="text-xs font-mono truncate">{wallet.address}</span>
                </div>
                <button type="button" onClick={handleCopyAddress}
                  className="shrink-0 ml-2 text-[10px] font-medium text-[var(--color-primary)] hover:underline">
                  {copied ? t('common.copied') : t('common.copy')}
                </button>
              </div>

              {/* Quick links */}
              <div className="flex gap-2">
                {wallet.address && (
                  <a href={`${EXPLORER_URL}/address/${wallet.address}`} target="_blank" rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium">
                    <ExternalLink size={14} className="text-[var(--color-text-secondary)]" />
                    {t('common.explorer')}
                  </a>
                )}
                {isAdmin && (
                  <Link href="/admin" onClick={() => setMenuOpen(false)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
                    <ShieldCheck size={14} />
                    {t('common.admin')}
                  </Link>
                )}
              </div>

              {/* Saved wallets — quick switch + manage (mobile) */}
              <div className="space-y-1.5">
                {wallet.savedWallets.length > 1 && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      {t('header.savedWallets')}
                    </p>
                    <div className="flex flex-col gap-1">
                      {wallet.savedWallets.map((w) => {
                        const addr = typeof w.address === 'string' ? w.address : '';
                        const isCurrent = wallet.address === addr;
                        return (
                          <button
                            key={addr || w.address}
                            type="button"
                            onClick={() => {
                              if (isCurrent) {
                                setMenuOpen(false);
                                return;
                              }
                              wallet.openConnectModal(addr);
                              setMenuOpen(false);
                            }}
                            className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left"
                          >
                            {addr && <UserAvatar address={addr} size={28} />}
                            <span className="text-xs font-mono truncate flex-1 min-w-0">
                              {addr ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : '...'}
                              {isCurrent && (
                                <span className="ml-1 text-[var(--color-success)] text-[10px]">({t('auth.current')})</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <button type="button" onClick={() => { wallet.openConnectModal(); setMenuOpen(false); }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">
                  <Wallet size={14} />
                  {t('header.manageWallets')}
                </button>
              </div>

              {/* Disconnect / Forget */}
              <div className="flex gap-2">
                <button type="button" onClick={handleDisconnect}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-warning)]">
                  {t('header.disconnect')}
                </button>
                <button type="button" onClick={handleForgetWallet}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-xs font-medium text-[var(--color-danger)]">
                  {t('header.forgetWallet')}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Error toast */}
      {wallet.error && (
        <div className="fixed top-16 left-1/2 z-[100] -translate-x-1/2 rounded-xl border border-[var(--color-danger)] bg-[var(--color-bg)] px-4 py-3 shadow-lg">
          <p className="text-sm text-[var(--color-danger)]">{wallet.error}</p>
        </div>
      )}

      <OnboardingModal isOpen={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </>
  );
}
