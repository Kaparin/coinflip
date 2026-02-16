'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LaunchTokenIcon, UserAvatar } from '@/components/ui';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGrantStatus } from '@/hooks/use-grant-status';
import { useGetVaultBalance } from '@coinflip/api-client';
import { useWalletBalance } from '@/hooks/use-wallet-balance';
import { StatusChips } from '@/components/features/auth/status-chips';
import { OnboardingModal } from '@/components/features/auth/onboarding-modal';
import { fromMicroLaunch } from '@coinflip/shared/constants';
import { ADMIN_ADDRESS, EXPLORER_URL } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';

export function Header() {
  const { t, locale, setLocale } = useTranslation();
  const pathname = usePathname();
  const wallet = useWalletContext();
  const { data: grantData } = useGrantStatus();
  const { data: balanceData } = useGetVaultBalance({
    query: { enabled: wallet.isConnected },
  });
  const { data: walletBalanceRaw } = useWalletBalance(wallet.address);
  const [menuOpen, setMenuOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const balance = balanceData?.data;
  const availableHuman = fromMicroLaunch(balance?.available ?? '0');
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
    wallet.forgetWallet();
    setWalletDropdownOpen(false);
    setMenuOpen(false);
  }, [wallet]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/game" className="flex items-center gap-2.5 group">
            <span className="text-lg font-extrabold tracking-tight">
              Coin<span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Flip</span>
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
                    <span className="flex items-center gap-1.5 font-bold tabular-nums text-[var(--color-success)]">{fmtBal(availableHuman)} <LaunchTokenIcon size={48} /></span>
                  </div>
                  {walletBalanceHuman > 0 && (
                    <div className="flex items-center gap-1.5" title={t('header.walletTitle')}>
                      <span className="text-[10px] text-[var(--color-text-secondary)]">{t('header.wallet')}</span>
                      <span className="flex items-center gap-1.5 font-bold tabular-nums">{fmtBal(walletBalanceHuman)} <LaunchTokenIcon size={48} /></span>
                    </div>
                  )}
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
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
                    </svg>
                    {t('nav.play')}
                  </Link>
                  <Link href="/game/profile"
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      pathname?.startsWith('/game/profile')
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                    }`}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    {t('nav.profile')}
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
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                {t('common.admin')}
              </Link>
            )}

            {wallet.isConnected ? (
              <div className="relative" ref={dropdownRef}>
                <button type="button" onClick={() => setWalletDropdownOpen(!walletDropdownOpen)}
                  className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]">
                  {wallet.address && <UserAvatar address={wallet.address} size={24} />}
                  <span className="font-mono text-xs">{wallet.shortAddress}</span>
                  <svg className={`h-3 w-3 text-[var(--color-text-secondary)] transition-transform ${walletDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
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
                        <svg className="h-4 w-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        <span>{t('nav.profile')}</span>
                      </Link>

                      {/* Copy address */}
                      <button type="button" onClick={handleCopyAddress}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-[var(--color-surface-hover)]">
                        <svg className="h-4 w-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                        </svg>
                        <span>{copied ? t('common.copied') : t('header.copyAddress')}</span>
                      </button>

                      {/* View in explorer */}
                      <a href={`${EXPLORER_URL}/address/${wallet.address}`} target="_blank" rel="noopener noreferrer"
                        onClick={() => setWalletDropdownOpen(false)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-[var(--color-surface-hover)]">
                        <svg className="h-4 w-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                        <span>{t('header.viewInExplorer')}</span>
                      </a>

                      {/* Admin link (if admin) */}
                      {isAdmin && (
                        <Link href="/admin" onClick={() => setWalletDropdownOpen(false)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-xs text-[var(--color-primary)] transition-colors hover:bg-[var(--color-surface-hover)]">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                          </svg>
                          <span>{t('header.adminPanel')}</span>
                        </Link>
                      )}
                    </div>

                    {/* Language switcher */}
                    <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                        </svg>
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

                    {/* Disconnect / Forget */}
                    <div className="py-1">
                      <button type="button" onClick={handleDisconnect}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs text-[var(--color-warning)] transition-colors hover:bg-[var(--color-surface-hover)]">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                        </svg>
                        <span>{t('header.disconnect')}</span>
                      </button>

                      <button type="button" onClick={handleForgetWallet}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--color-surface-hover)]">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
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

          {/* Mobile: 1-Click chip + burger icon */}
          <div className="flex items-center gap-1.5 md:hidden">
            {wallet.isConnected && (
              <StatusChips
                oneClickEnabled={oneClickEnabled}
                gasSponsored={gasSponsored}
                compact
                onSetupClick={() => setOnboardingOpen(true)}
              />
            )}
            <button type="button" onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
              aria-label={t('header.toggleMenu')}>
              {menuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown — minimal: address + actions only (balance/wallet moved to /game/wallet) */}
        {menuOpen && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:hidden">
            <div className="flex flex-col gap-2.5">
              {wallet.isConnected ? (
                <>
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
                    <a href={`${EXPLORER_URL}/address/${wallet.address}`} target="_blank" rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium">
                      <svg className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      {t('common.explorer')}
                    </a>
                    {isAdmin && (
                      <Link href="/admin" onClick={() => setMenuOpen(false)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                        {t('common.admin')}
                      </Link>
                    )}
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
                </>
              ) : (
                <button type="button" onClick={() => { wallet.connect(); setMenuOpen(false); }}
                  className="rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold">
                  {t('common.connectWallet')}
                </button>
              )}
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
