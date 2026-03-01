'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Puzzle, User, ShieldCheck, ChevronDown, Copy, ExternalLink, Languages, LogOut, Trash2, X, Menu, Wallet, Trophy, Crown, Newspaper, ShoppingCart, Volume2, VolumeX, Vibrate, SmartphoneNfc } from 'lucide-react';
import { LaunchTokenIcon, AxmIcon, UserAvatar } from '@/components/ui';
import { VipAvatarFrame } from '@/components/ui/vip-avatar-frame';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGetVaultBalance, useGetActiveEvents, useGetCurrentUser } from '@coinflip/api-client';
import { useWalletBalance, useNativeBalance } from '@/hooks/use-wallet-balance';
import { VipPurchaseModal } from '@/components/features/vip/vip-purchase-modal';
import { useVipStatus, useVipCustomization } from '@/hooks/use-vip';
import { fromMicroLaunch } from '@coinflip/shared/constants';
import { ADMIN_ADDRESS, EXPLORER_URL, PRESALE_CONTRACT } from '@/lib/constants';
import { useTranslation } from '@/lib/i18n';
import { usePendingBalance } from '@/contexts/pending-balance-context';
import { BalanceDisplay } from '@/components/features/vault/balance-display';
import { isWsConnected, POLL_INTERVAL_WS_CONNECTED, POLL_INTERVAL_WS_DISCONNECTED } from '@/hooks/use-websocket';
import { soundManager } from '@/lib/sounds';
import { haptics } from '@/lib/haptics';

export function Header() {
  const { t, locale, setLocale } = useTranslation();
  const pathname = usePathname();
  const wallet = useWalletContext();
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
  const { data: nativeBalanceRaw } = useNativeBalance(wallet.address);
  const { pendingDeduction } = usePendingBalance();
  const { data: vipStatus } = useVipStatus(wallet.isConnected);
  const isDiamond = vipStatus?.active && vipStatus.tier === 'diamond';
  const { data: vipCustom } = useVipCustomization(!!isDiamond);
  const { data: currentUserData } = useGetCurrentUser({ query: { enabled: wallet.isConnected, staleTime: 30_000 } });
  const userNickname = (currentUserData as any)?.data?.nickname as string | null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [vipModalOpen, setVipModalOpen] = useState(false);
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(() => soundManager.isEnabled());
  const [hapticsOn, setHapticsOn] = useState(() => haptics.isEnabled());

  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    soundManager.setEnabled(next);
  }, [soundOn]);

  const toggleHaptics = useCallback(() => {
    const next = !hapticsOn;
    setHapticsOn(next);
    haptics.setEnabled(next);
  }, [hapticsOn]);

  const balance = balanceData?.data;
  const rawAvailable = BigInt(balance?.available ?? '0');
  const adjusted = rawAvailable - pendingDeduction;
  const availableHuman = fromMicroLaunch((adjusted < 0n ? 0n : adjusted).toString());
  const walletBalanceHuman = fromMicroLaunch(walletBalanceRaw ?? '0');
  const nativeBalanceHuman = Number(nativeBalanceRaw ?? '0') / 1_000_000; // uaxm → AXM
  const isLowAxm = !vipStatus?.active && nativeBalanceHuman < 0.5;

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
            {wallet.address && (
              <>
                {/* Balance display */}
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-1.5" title={t('header.vaultTitle')}>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">{t('header.vault')}</span>
                    <span className="flex items-center gap-1.5 font-bold tabular-nums text-[var(--color-success)]">{fmtBal(availableHuman)} <LaunchTokenIcon size={18} /></span>
                  </div>
                  <div className="flex items-center gap-1.5" title={t('header.walletTitle')}>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">{t('header.wallet')}</span>
                    <span className="flex items-center gap-1.5 font-bold tabular-nums">{fmtBal(walletBalanceHuman)} <LaunchTokenIcon size={18} /></span>
                  </div>
                  <div className={`flex items-center gap-1 ${isLowAxm ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-secondary)]'}`} title="AXM">
                    <span className="flex items-center gap-1 text-[10px] tabular-nums font-medium">{nativeBalanceHuman.toFixed(2)} <AxmIcon size={18} /></span>
                    {isLowAxm && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />}
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
                  {PRESALE_CONTRACT && (
                    <Link href="/game/presale"
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        pathname?.startsWith('/game/presale')
                          ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                      }`}>
                      <ShoppingCart size={14} />
                      {t('nav.presale')}
                    </Link>
                  )}
                  <Link href="/game/news"
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      pathname?.startsWith('/game/news')
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                    }`}>
                    <Newspaper size={14} />
                    {t('nav.news')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setVipModalOpen(true)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      vipStatus?.active
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
                    }`}
                  >
                    <Crown size={14} />
                    {vipStatus?.active ? (
                      <span className="capitalize">{vipStatus.tier}</span>
                    ) : (
                      t('nav.vip')
                    )}
                  </button>
                </nav>

              </>
            )}

            {isAdmin && (
              <Link href="/admin"
                className="flex items-center gap-1.5 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/20">
                <ShieldCheck size={14} />
                {t('common.admin')}
              </Link>
            )}

            {wallet.address ? (
              <div className="relative" ref={dropdownRef}>
                <button type="button" onClick={() => setWalletDropdownOpen(!walletDropdownOpen)}
                  className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]">
                  {wallet.address && (
                    <VipAvatarFrame tier={vipStatus?.active ? vipStatus.tier : null} frameStyle={vipCustom?.frameStyle}>
                      <UserAvatar address={wallet.address} size={24} />
                    </VipAvatarFrame>
                  )}
                  <span className={`text-xs max-w-[120px] truncate ${userNickname ? 'font-medium' : 'font-mono'}`}>
                    {userNickname || wallet.shortAddress || ''}
                  </span>
                  <ChevronDown size={12} className={`text-[var(--color-text-secondary)] transition-transform ${walletDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Wallet dropdown */}
                {walletDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden animate-fade-in z-50">
                    {/* Profile header */}
                    <div className="px-4 py-3 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-3">
                        {wallet.address && (
                          <VipAvatarFrame tier={vipStatus?.active ? vipStatus.tier : null} frameStyle={vipCustom?.frameStyle}>
                            <UserAvatar address={wallet.address} size={36} />
                          </VipAvatarFrame>
                        )}
                        <div className="min-w-0 flex-1">
                          {userNickname && (
                            <p className="text-sm font-bold truncate">{userNickname}</p>
                          )}
                          <p className="text-[10px] font-mono text-[var(--color-text-secondary)] break-all leading-relaxed">{wallet.address}</p>
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

                    {/* Sound & Haptic toggles */}
                    <div className="px-4 py-2.5 border-b border-[var(--color-border)] space-y-2">
                      <div className="flex items-center gap-2">
                        {soundOn ? <Volume2 size={16} className="text-[var(--color-text-secondary)]" /> : <VolumeX size={16} className="text-[var(--color-text-secondary)]" />}
                        <span className="flex-1 text-xs">{t('settings.sound')}</span>
                        <div className="flex rounded-lg bg-[var(--color-bg)] p-0.5 text-[10px] font-bold">
                          <button type="button" onClick={toggleSound}
                            className={`rounded-md px-2.5 py-1.5 transition-colors ${soundOn ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}>
                            {t('settings.on')}
                          </button>
                          <button type="button" onClick={toggleSound}
                            className={`rounded-md px-2.5 py-1.5 transition-colors ${!soundOn ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}>
                            {t('settings.off')}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {hapticsOn ? <Vibrate size={16} className="text-[var(--color-text-secondary)]" /> : <SmartphoneNfc size={16} className="text-[var(--color-text-secondary)]" />}
                        <span className="flex-1 text-xs">{t('settings.haptics')}</span>
                        <div className="flex rounded-lg bg-[var(--color-bg)] p-0.5 text-[10px] font-bold">
                          <button type="button" onClick={toggleHaptics}
                            className={`rounded-md px-2.5 py-1.5 transition-colors ${hapticsOn ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}>
                            {t('settings.on')}
                          </button>
                          <button type="button" onClick={toggleHaptics}
                            className={`rounded-md px-2.5 py-1.5 transition-colors ${!hapticsOn ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}>
                            {t('settings.off')}
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

          {/* Mobile: balance indicator + burger */}
          <div className="flex items-center gap-1.5 md:hidden min-w-0">
            {wallet.address ? (
              <>
                {/* Balance indicator — toggles balance panel */}
                <button
                  type="button"
                  onClick={() => { setBalanceOpen(!balanceOpen); setMenuOpen(false); }}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold tabular-nums transition-all active:scale-[0.96] ${
                    balanceOpen
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-success)]/30 bg-[var(--color-success)]/5 text-[var(--color-success)]'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {fmtBal(availableHuman)} <LaunchTokenIcon size={18} />
                  </span>
                  <ChevronDown size={10} className={`transition-transform ${balanceOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* VIP button — always visible in header */}
                <button
                  type="button"
                  onClick={() => setVipModalOpen(true)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors active:scale-95 ${
                    vipStatus?.active
                      ? 'text-amber-400 bg-amber-500/10'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                  }`}
                  aria-label="VIP"
                >
                  <Crown size={18} />
                </button>

                <button type="button" onClick={() => { setMenuOpen(!menuOpen); setBalanceOpen(false); }}
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

        {/* Mobile balance panel — full-width BalanceDisplay */}
        {balanceOpen && wallet.address && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 md:hidden animate-fade-in">
            <BalanceDisplay />
          </div>
        )}

        {/* Mobile dropdown — address + actions (only when connected; Connect is in header when disconnected) */}
        {menuOpen && wallet.address && (
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

              {/* Sound & Haptic toggles (mobile) */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  {soundOn ? <Volume2 size={14} className="text-[var(--color-text-secondary)]" /> : <VolumeX size={14} className="text-[var(--color-text-secondary)]" />}
                  <span className="flex-1 text-xs">{t('settings.sound')}</span>
                  <button type="button" onClick={toggleSound}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${soundOn ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'}`}>
                    {soundOn ? t('settings.on') : t('settings.off')}
                  </button>
                </div>
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  {hapticsOn ? <Vibrate size={14} className="text-[var(--color-text-secondary)]" /> : <SmartphoneNfc size={14} className="text-[var(--color-text-secondary)]" />}
                  <span className="flex-1 text-xs">{t('settings.haptics')}</span>
                  <button type="button" onClick={toggleHaptics}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${hapticsOn ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'}`}>
                    {hapticsOn ? t('settings.on') : t('settings.off')}
                  </button>
                </div>
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

      <VipPurchaseModal open={vipModalOpen} onClose={() => setVipModalOpen(false)} />
    </>
  );
}
