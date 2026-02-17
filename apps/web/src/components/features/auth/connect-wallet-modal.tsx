'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';
import { Modal } from '@/components/ui/modal';
import { Lock, ShieldCheck, Shield, CheckCircle, ChevronDown, UserPlus, Wallet, Plus } from 'lucide-react';
import { getCapturedRefCode, registerByAddress } from '@/hooks/use-referral';

interface ConnectWalletModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'choose' | 'import' | 'unlock' | 'confirm' | 'success' | 'security';

/**
 * Connect Wallet modal — supports:
 * 1. Import mnemonic (new user)
 * 2. Unlock with PIN (returning user)
 */
export function ConnectWalletModal({ open, onClose }: ConnectWalletModalProps) {
  const { t, locale } = useTranslation();
  const {
    hasSaved, savedAddress, savedWallets, address: connectedAddress, isConnected, isConnecting, error,
    connectWithMnemonic, unlockWithPin, forgetWallet,
  } = useWalletContext();

  const [step, setStep] = useState<Step>('choose');
  /** When multiple wallets: which one user selected to unlock */
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [derivedAddress, setDerivedAddress] = useState('');
  const [localError, setLocalError] = useState('');

  // "Who invited you?" state
  const [inviterOpen, setInviterOpen] = useState(false);
  const [inviterAddr, setInviterAddr] = useState('');
  const [inviterStatus, setInviterStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [inviterError, setInviterError] = useState('');
  const hasRefCode = typeof window !== 'undefined' && !!getCapturedRefCode();

  const mnemonicRef = useRef<HTMLTextAreaElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  // Track whether a connect/unlock operation is in flight to prevent step resets
  const isInFlightRef = useRef(false);

  // Reset state when modal opens (only reacts to `open` changing to true)
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Modal just opened
      setMnemonic('');
      setPin('');
      setPinConfirm('');
      setLocalError('');
      setDerivedAddress('');
      setSelectedWalletAddress(null);
      setInviterOpen(false);
      setInviterAddr('');
      setInviterStatus('idle');
      setInviterError('');
      isInFlightRef.current = false;
      // Multi-wallet: show choose if multiple (or if connected—switch mode), unlock if single, import if none
      if (hasSaved) {
        const showChoose = savedWallets.length > 1 || (isConnected && savedWallets.length >= 1);
        setStep(showChoose ? 'choose' : 'unlock');
        if (savedWallets.length === 1 && !showChoose) setSelectedWalletAddress(savedWallets[0]!.address);
      } else {
        setStep('import');
      }
    }
    prevOpenRef.current = open;
  }, [open, hasSaved, savedWallets]);

  // When wallet becomes connected during unlock/confirm, transition to success
  useEffect(() => {
    if (open && isConnected && !isConnecting && (step === 'unlock' || step === 'confirm')) {
      isInFlightRef.current = false;
      setStep('success');

      // Register inviter by address if user entered one (and no ref code from URL)
      if (inviterAddr.trim() && !hasRefCode) {
        registerByAddress(inviterAddr.trim()).catch(() => {});
      }

      setMnemonic('');
      setPin('');
      setPinConfirm('');
    }
  }, [open, isConnected, isConnecting, step]);

  // Auto-close when on success step
  useEffect(() => {
    if (open && step === 'success') {
      const timer = setTimeout(onClose, 1200);
      return () => clearTimeout(timer);
    }
  }, [open, step, onClose]);

  // Focus input on step change
  useEffect(() => {
    if (step === 'import') setTimeout(() => mnemonicRef.current?.focus(), 100);
    if (step === 'unlock') setTimeout(() => pinRef.current?.focus(), 100);
  }, [step]);

  const wordCount = mnemonic.trim().split(/\s+/).filter(Boolean).length;
  const isValidWordCount = wordCount === 12 || wordCount === 24;

  /** Handle mnemonic submission — derive address first */
  const handleMnemonicNext = useCallback(async () => {
    if (!isValidWordCount) return;
    if (pin.length < 4) {
      setLocalError(t('auth.pinMinError'));
      return;
    }
    if (pin !== pinConfirm) {
      setLocalError(t('auth.pinMismatch'));
      return;
    }
    setLocalError('');

    try {
      // Quick derivation to show address before full connect
      const { deriveWallet } = await import('@/lib/wallet-core');
      const { address } = await deriveWallet(mnemonic);
      setDerivedAddress(address);
      setStep('confirm');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t('auth.invalidMnemonic'));
    }
  }, [mnemonic, pin, pinConfirm, isValidWordCount]);

  /** Confirm and connect — the useEffect above handles success/close */
  const handleConfirmConnect = useCallback(async () => {
    isInFlightRef.current = true;
    await connectWithMnemonic(mnemonic, pin, rememberMe);
  }, [mnemonic, pin, rememberMe, connectWithMnemonic]);

  /** Unlock saved wallet — the useEffect above handles success/close */
  const handleUnlock = useCallback(async () => {
    if (pin.length < 4) {
      setLocalError(t('auth.enterPin'));
      return;
    }
    setLocalError('');
    isInFlightRef.current = true;
    const addr = selectedWalletAddress ?? savedAddress ?? undefined;
    await unlockWithPin(pin, addr);
  }, [pin, selectedWalletAddress, savedAddress, unlockWithPin, t]);

  /** Forget specific wallet and go to choose/import */
  const handleForgetWallet = useCallback((addr: string) => {
    forgetWallet(addr);
    setPin('');
    setPinConfirm('');
    setSelectedWalletAddress(null);
    // After forget, one less wallet — go to import if none left, else choose
    const remaining = savedWallets.filter((w) => w.address !== addr).length;
    setStep(remaining === 0 ? 'import' : 'choose');
  }, [forgetWallet, savedWallets]);

  /** Use different wallet — go to choose (or import if adding new) */
  const handleUseDifferent = useCallback(() => {
    setPin('');
    setSelectedWalletAddress(null);
    setStep(savedWallets.length > 1 ? 'choose' : 'import');
  }, [savedWallets.length]);

  if (!open) return null;

  const canClose = !(step === 'confirm' && isConnecting);
  const walletToUnlock = selectedWalletAddress ?? savedAddress;

  return (
    <Modal open onClose={onClose} showCloseButton={canClose} showCloseButtonBottom>
      <div className="p-2 sm:p-5 max-w-md w-full">

        {/* ==== CHOOSE WALLET (multi-wallet) ==== */}
        {step === 'choose' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t('auth.chooseWallet')}</h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {t('auth.chooseWalletDesc')}
            </p>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {savedWallets.map((w) => {
                const isCurrent = connectedAddress === w.address;
                return (
                <button
                  key={w.address}
                  type="button"
                  onClick={() => {
                    if (isCurrent) {
                      onClose();
                      return;
                    }
                    setSelectedWalletAddress(w.address);
                    setStep('unlock');
                    setPin('');
                    setLocalError('');
                    setTimeout(() => pinRef.current?.focus(), 100);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-left transition-colors hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-border)]/10"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15">
                    <Wallet size={18} className="text-[var(--color-primary)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono truncate">
                      {`${w.address.slice(0, 14)}...${w.address.slice(-8)}`}
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
            </div>

            <button
              type="button"
              onClick={() => {
                setStep('import');
                setMnemonic('');
                setPin('');
                setPinConfirm('');
                setSelectedWalletAddress(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              <Plus size={18} />
              {t('auth.addNewWallet')}
            </button>
          </div>
        )}

        {/* ==== IMPORT MNEMONIC ==== */}
        {step === 'import' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">{t('auth.connectTitle')}</h2>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                {t('auth.connectDesc')}
              </p>
            </div>

            {/* Security badge */}
            <div className="flex items-center gap-2 rounded-lg bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 px-3 py-2">
              <Lock size={16} className="text-[var(--color-success)] shrink-0" />
              <span className="text-[10px] text-[var(--color-success)]">
                {t('auth.clientSideOnly')}
              </span>
            </div>

            {/* Mnemonic input */}
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                {t('auth.secretPhrase', { count: wordCount })}
              </label>
              <textarea
                ref={mnemonicRef}
                rows={3}
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value.toLowerCase())}
                placeholder={t('auth.phrasePlaceholder')}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm font-mono placeholder:text-[var(--color-text-secondary)]/40 focus:border-[var(--color-primary)] focus:outline-none resize-none"
              />
            </div>

            {/* PIN */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('auth.pinCode')}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={t('auth.minChars')}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('auth.confirmPin')}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value)}
                  placeholder={t('auth.repeatPin')}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
              />
              <span className="text-xs text-[var(--color-text-secondary)]">
                {t('auth.rememberWallet')}
              </span>
            </label>

            {/* "Who invited you?" collapsible — only shown when no ref code captured */}
            {!hasRefCode && (
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setInviterOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/10 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus size={14} />
                    {t('auth.whoInvited')}
                  </span>
                  <ChevronDown size={14} className={`transition-transform ${inviterOpen ? 'rotate-180' : ''}`} />
                </button>
                {inviterOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-[var(--color-border)]">
                    <p className="text-[10px] text-[var(--color-text-secondary)] pt-2">
                      {t('auth.whoInvitedHint')}
                    </p>
                    <input
                      type="text"
                      value={inviterAddr}
                      onChange={(e) => {
                        setInviterAddr(e.target.value);
                        setInviterStatus('idle');
                        setInviterError('');
                      }}
                      placeholder="axm1..."
                      spellCheck={false}
                      autoComplete="off"
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-mono placeholder:text-[var(--color-text-secondary)]/40 focus:border-[var(--color-primary)] focus:outline-none"
                    />
                    <p className="text-[9px] text-[var(--color-text-secondary)]">
                      {t('auth.inviterOptional')}
                    </p>
                    {inviterError && (
                      <p className="text-[10px] text-[var(--color-danger)]">{inviterError}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {(localError || error) && (
              <p className="text-xs text-[var(--color-danger)]">{localError || error}</p>
            )}

            <button
              type="button"
              disabled={!isValidWordCount || pin.length < 4 || isConnecting}
              onClick={handleMnemonicNext}
              className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isConnecting ? t('auth.deriving') : t('auth.continue')}
            </button>

            {savedWallets.length > 0 && (
              <button
                type="button"
                onClick={() => { setStep('choose'); setMnemonic(''); setPin(''); setPinConfirm(''); }}
                className="w-full text-center text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:underline transition-colors"
              >
                {t('auth.backToWalletList')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep('security')}
              className="w-full text-center text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:underline mt-1 transition-colors"
            >
              {t('auth.securityAudit')}
            </button>
          </div>
        )}

        {/* ==== CONFIRM ADDRESS ==== */}
        {step === 'confirm' && (
          <div className="space-y-4">
            {isConnecting ? (
              /* Connecting overlay */
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-[var(--color-primary)]/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--color-primary)] animate-spin" />
                  <Lock size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-bold">{t('common.connecting')}</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    {t('auth.encryptingAndSaving')}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 w-full">
                  <Shield size={14} className="text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    {t('auth.doNotClose')}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold">{t('auth.confirmAddress')}</h2>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {t('auth.confirmAddressDesc')}
                </p>

                <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4 text-center">
                  <p className="text-xs text-[var(--color-text-secondary)] mb-1">{t('auth.yourAddress')}</p>
                  <p className="text-sm font-mono font-bold break-all">{derivedAddress}</p>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep('import')}
                    className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold">
                    {t('common.back')}
                  </button>
                  <button type="button" disabled={isConnecting} onClick={handleConfirmConnect}
                    className="flex-1 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold disabled:opacity-40">
                    {t('auth.connect')}
                  </button>
                </div>
                {error && <p className="text-xs text-[var(--color-danger)] text-center">{error}</p>}
              </>
            )}
          </div>
        )}

        {/* ==== UNLOCK SAVED ==== */}
        {step === 'unlock' && (
          <div className="space-y-4">
            {isConnecting ? (
              /* Unlocking overlay */
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-[var(--color-primary)]/20" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[var(--color-primary)] animate-spin" />
                  <Lock size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-bold">{t('auth.unlocking')}</p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    {t('auth.encryptingAndSaving')}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold">{t('auth.welcomeBack')}</h2>

                <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4 text-center">
                  <p className="text-xs text-[var(--color-text-secondary)] mb-1">{t('auth.savedWallet')}</p>
                  <p className="text-sm font-mono font-bold">
                    {walletToUnlock ? `${walletToUnlock.slice(0, 12)}...${walletToUnlock.slice(-6)}` : '...'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    {t('auth.enterPinToUnlock')}
                  </label>
                  <input
                    ref={pinRef}
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setLocalError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    placeholder={t('auth.yourPin')}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  />
                </div>

                {(localError || error) && (
                  <p className="text-xs text-[var(--color-danger)]">{localError || error}</p>
                )}

                <button type="button" disabled={pin.length < 4} onClick={handleUnlock}
                  className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold disabled:opacity-40">
                  {t('auth.unlock')}
                </button>

                <div className="flex items-center justify-between pt-1">
                  {walletToUnlock && (
                    <button type="button" onClick={() => handleForgetWallet(walletToUnlock)}
                      className="text-[10px] text-[var(--color-danger)] hover:underline">
                      {t('auth.forgetThisWallet')}
                    </button>
                  )}
                  <button type="button" onClick={handleUseDifferent}
                    className="text-[10px] text-[var(--color-text-secondary)] hover:underline ml-auto">
                    {savedWallets.length > 1 ? t('auth.chooseAnotherWallet') : t('auth.useDifferentWallet')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ==== SECURITY AUDIT ==== */}
        {step === 'security' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-success)]/15">
                <ShieldCheck size={16} className="text-[var(--color-success)]" />
              </div>
              <h2 className="text-lg font-bold">{t('auth.securityAuditTitle')}</h2>
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1 -mr-1">

              {/* --- EN Section --- */}
              {locale === 'en' && <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-3">

                {/* 1 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">1.</span> Your mnemonic never leaves this device
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    All cryptographic operations (key derivation, signing) happen <strong>entirely inside your browser</strong> using
                    the standard <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">Web Crypto API</code> and <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">CosmJS</code>.
                    No network request ever contains your mnemonic, private key, or PIN.
                  </p>
                </div>

                {/* 2 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">2.</span> Encryption at rest
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    If you choose "Remember wallet", your mnemonic is encrypted with <strong>AES-256-GCM</strong> before being
                    saved to <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">localStorage</code>.
                    The encryption key is derived from your PIN via <strong>PBKDF2</strong> with <strong>100,000 iterations</strong>,
                    a random 16-byte salt, and a random 12-byte IV -- all generated fresh each time.
                    Only the encrypted blob is stored, never the plaintext.
                  </p>
                </div>

                {/* 3 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">3.</span> What the server sees
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    The server only receives your <strong>public address</strong> (<code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">axm1...</code>)
                    to register your session. It never sees your mnemonic, private key, or PIN. Transactions are signed
                    locally and only the signed bytes are broadcast to the blockchain.
                  </p>
                </div>

                {/* 4 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">4.</span> Verify it yourself
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Open your browser DevTools (<code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">F12</code>):
                  </p>
                  <ul className="text-[11px] text-[var(--color-text-secondary)] mt-1 ml-3 space-y-0.5 list-disc list-outside leading-relaxed">
                    <li><strong>Application &rarr; Local Storage</strong> -- you will see only the key <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">coinflip_wallets</code> containing an encrypted JSON array (not your mnemonic).</li>
                    <li><strong>Network tab</strong> -- filter by your mnemonic words; no request ever contains them.</li>
                  </ul>
                </div>

                {/* 5 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">5.</span> Open source code
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    The entire wallet logic is contained in two auditable files:
                    <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded ml-1">wallet-core.ts</code> (encryption & key derivation) and
                    <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded ml-1">wallet-signer.ts</code> (transaction signing).
                    Anyone can inspect the source to confirm no data is exfiltrated.
                  </p>
                </div>

                {/* 6 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">6.</span> What if someone steals my localStorage?
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Without your PIN, the encrypted blob is useless. AES-256-GCM is a military-grade cipher;
                    brute-forcing a 4+ character PIN through 100,000 PBKDF2 iterations is computationally infeasible.
                    For maximum security, use a longer PIN (8+ characters with mixed case and numbers).
                  </p>
                </div>
              </div>}

              {/* --- RU Section --- */}
              {locale === 'ru' && <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-3">

                {/* 1 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">1.</span> Ваша мнемоника никогда не покидает устройство
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Все криптографические операции (генерация ключей, подпись транзакций) выполняются <strong>полностью в вашем браузере</strong> с
                    помощью стандартного <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">Web Crypto API</code> и <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">CosmJS</code>.
                    Ни один сетевой запрос не содержит вашу мнемонику, приватный ключ или PIN.
                  </p>
                </div>

                {/* 2 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">2.</span> Шифрование при хранении
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Если вы выбираете &laquo;Запомнить кошелёк&raquo;, мнемоника шифруется алгоритмом <strong>AES-256-GCM</strong> перед
                    сохранением в <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">localStorage</code>.
                    Ключ шифрования выводится из вашего PIN через <strong>PBKDF2</strong> со <strong>100 000 итерациями</strong>,
                    случайной 16-байтной солью и 12-байтным IV. Сохраняется только зашифрованный блоб, никогда открытый текст.
                  </p>
                </div>

                {/* 3 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">3.</span> Что видит сервер
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Сервер получает только ваш <strong>публичный адрес</strong> (<code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">axm1...</code>)
                    для регистрации сессии. Он никогда не видит мнемонику, приватный ключ или PIN. Транзакции подписываются
                    локально, и на блокчейн отправляются только подписанные байты.
                  </p>
                </div>

                {/* 4 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">4.</span> Проверьте сами
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Откройте DevTools в браузере (<code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">F12</code>):
                  </p>
                  <ul className="text-[11px] text-[var(--color-text-secondary)] mt-1 ml-3 space-y-0.5 list-disc list-outside leading-relaxed">
                    <li><strong>Application &rarr; Local Storage</strong> -- вы увидите только ключ <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">coinflip_wallets</code> с зашифрованным JSON-массивом (не вашу мнемонику).</li>
                    <li><strong>Вкладка Network</strong> -- отфильтруйте по словам вашей мнемоники; ни один запрос не содержит их.</li>
                  </ul>
                </div>

                {/* 5 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">5.</span> Открытый исходный код
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Вся логика кошелька содержится в двух файлах, доступных для аудита:
                    <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded ml-1">wallet-core.ts</code> (шифрование и генерация ключей) и
                    <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded ml-1">wallet-signer.ts</code> (подпись транзакций).
                    Любой может проверить код и убедиться, что данные не передаются третьим лицам.
                  </p>
                </div>

                {/* 6 */}
                <div>
                  <h3 className="text-xs font-bold flex items-center gap-1.5">
                    <span className="text-[var(--color-success)]">6.</span> Что если кто-то украдёт мой localStorage?
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Без вашего PIN зашифрованный блоб бесполезен. AES-256-GCM -- шифр военного уровня;
                    перебор PIN из 4+ символов через 100 000 итераций PBKDF2 вычислительно невозможен.
                    Для максимальной безопасности используйте длинный PIN (8+ символов с буквами и цифрами).
                  </p>
                </div>
              </div>}

            </div>

            {/* Back button */}
            <button
              type="button"
              onClick={() => setStep('import')}
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--color-border)]/20"
            >
              {t('common.back')}
            </button>
          </div>
        )}

        {/* ==== SUCCESS ==== */}
        {step === 'success' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-success)]/15">
              <CheckCircle size={28} className="text-[var(--color-success)]" />
            </div>
            <p className="text-base font-bold">{t('auth.walletConnected')}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{t('auth.readyToPlay')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
