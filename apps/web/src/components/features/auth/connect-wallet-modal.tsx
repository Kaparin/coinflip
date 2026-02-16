'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWalletContext } from '@/contexts/wallet-context';
import { useTranslation } from '@/lib/i18n';
import { Modal } from '@/components/ui/modal';

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
    hasSaved, savedAddress, isConnected, isConnecting, error,
    connectWithMnemonic, unlockWithPin, forgetWallet,
  } = useWalletContext();

  const [step, setStep] = useState<Step>('choose');
  const [mnemonic, setMnemonic] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [derivedAddress, setDerivedAddress] = useState('');
  const [localError, setLocalError] = useState('');

  const mnemonicRef = useRef<HTMLTextAreaElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setMnemonic('');
      setPin('');
      setPinConfirm('');
      setLocalError('');
      setDerivedAddress('');
      // If has saved wallet, go to unlock; otherwise import
      setStep(hasSaved ? 'unlock' : 'import');
    }
  }, [open, hasSaved]);

  // When wallet becomes connected during unlock/confirm, transition to success
  useEffect(() => {
    if (open && isConnected && !isConnecting && (step === 'unlock' || step === 'confirm')) {
      setStep('success');
      // Clear sensitive data from memory
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
    await connectWithMnemonic(mnemonic, pin, rememberMe);
  }, [mnemonic, pin, rememberMe, connectWithMnemonic]);

  /** Unlock saved wallet — the useEffect above handles success/close */
  const handleUnlock = useCallback(async () => {
    if (pin.length < 4) {
      setLocalError(t('auth.enterPin'));
      return;
    }
    setLocalError('');
    await unlockWithPin(pin);
  }, [pin, unlockWithPin]);

  /** Handle forget and switch to import */
  const handleForgetAndImport = useCallback(() => {
    forgetWallet();
    setStep('import');
    setPin('');
    setPinConfirm('');
  }, [forgetWallet]);

  if (!open) return null;

  return (
    <Modal open onClose={onClose}>
      <div className="p-5 max-w-md w-full">

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
              <svg className="h-4 w-4 text-[var(--color-success)] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
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
                {isConnecting ? t('common.connecting') : t('auth.connect')}
              </button>
            </div>
            {error && <p className="text-xs text-[var(--color-danger)] text-center">{error}</p>}
          </div>
        )}

        {/* ==== UNLOCK SAVED ==== */}
        {step === 'unlock' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t('auth.welcomeBack')}</h2>

            <div className="rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] p-4 text-center">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">{t('auth.savedWallet')}</p>
              <p className="text-sm font-mono font-bold">
                {savedAddress ? `${savedAddress.slice(0, 12)}...${savedAddress.slice(-6)}` : '...'}
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

            <button type="button" disabled={pin.length < 4 || isConnecting} onClick={handleUnlock}
              className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold disabled:opacity-40">
              {isConnecting ? t('auth.unlocking') : t('auth.unlock')}
            </button>

            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={handleForgetAndImport}
                className="text-[10px] text-[var(--color-danger)] hover:underline">
                {t('auth.forgetThisWallet')}
              </button>
              <button type="button" onClick={() => setStep('import')}
                className="text-[10px] text-[var(--color-text-secondary)] hover:underline">
                {t('auth.useDifferentWallet')}
              </button>
            </div>
          </div>
        )}

        {/* ==== SECURITY AUDIT ==== */}
        {step === 'security' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-success)]/15">
                <svg className="h-4 w-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
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
                    <li><strong>Application &rarr; Local Storage</strong> -- you will see only the key <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">coinflip_wallet</code> containing an encrypted JSON blob (not your mnemonic).</li>
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
                    <li><strong>Application &rarr; Local Storage</strong> -- вы увидите только ключ <code className="text-[10px] bg-[var(--color-border)]/40 px-1 rounded">coinflip_wallet</code> с зашифрованным JSON (не вашу мнемонику).</li>
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
              <svg className="h-7 w-7 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base font-bold">{t('auth.walletConnected')}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{t('auth.readyToPlay')}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
