'use client';

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  ChevronLeft,
  Send,
  Info,
} from 'lucide-react';
import Image from 'next/image';
import { Modal } from '@/components/ui/modal';
import { UserAvatar, GameTokenIcon, LaunchTokenIcon } from '@/components/ui';
import { VipBadge } from '@/components/ui/vip-badge';
import { getVipNameClass } from '@/components/ui/vip-avatar-frame';
import { formatLaunch, fromMicroLaunch } from '@coinflip/shared/constants';
import { useTranslation } from '@/lib/i18n';
import { useWalletContext } from '@/contexts/wallet-context';
import { useGetVaultBalance } from '@coinflip/api-client';
import {
  useFavorites,
  useAllUsers,
  useTransfer,
  type SocialUser,
} from '@/hooks/use-social';

// ─── Types ────────────────────────────────────────────────

type Currency = 'coin' | 'axm';
type Step = 'recipient' | 'amount' | 'confirm' | 'result';

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected recipient (from user card click) */
  initialRecipient?: SocialUser | null;
  /** Pre-selected currency */
  initialCurrency?: Currency;
}

// ─── Helpers ──────────────────────────────────────────────

function shortAddr(addr: string): string {
  if (!addr || addr.length < 16) return addr ?? '';
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

const AMOUNT_PRESETS_COIN = [10, 50, 100, 500];
const AMOUNT_PRESETS_AXM = [1, 5, 10, 50];
const FEE_BPS = 500; // 5%

// ─── Recipient Search ─────────────────────────────────────

function RecipientStep({
  onSelect,
  currentAddress,
}: {
  onSelect: (user: SocialUser) => void;
  currentAddress: string | null;
}) {
  const { t } = useTranslation();
  const { isConnected } = useWalletContext();
  const [search, setSearch] = useState('');
  const { users: favUsers, loading: favLoading } = useFavorites(isConnected);
  const { users: allUsers, loading: allLoading } = useAllUsers(true, search);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredFavs = useMemo(
    () => favUsers.filter((u) => u.address !== currentAddress),
    [favUsers, currentAddress],
  );

  const filteredAll = useMemo(
    () => allUsers.filter((u) => u.address !== currentAddress && !favUsers.some((f) => f.address === u.address)),
    [allUsers, currentAddress, favUsers],
  );

  const showFavs = !search.trim() && filteredFavs.length > 0;

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('social.recipientSearch')}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
      </div>

      {/* Favorites section */}
      {showFavs && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1.5 px-1">
            {t('social.favoritesFirst')}
          </p>
          <div className="space-y-0.5">
            {filteredFavs.map((user) => (
              <RecipientRow key={user.address} user={user} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}

      {/* All users / search results */}
      <div>
        {!showFavs && search.trim().length >= 2 && (
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1.5 px-1">
            {t('social.allUsers')}
          </p>
        )}
        {(favLoading || allLoading) ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={18} className="animate-spin text-[var(--color-text-secondary)]" />
          </div>
        ) : filteredAll.length === 0 && !showFavs ? (
          <p className="text-center text-xs text-[var(--color-text-secondary)] py-6">{t('social.noUsersFound')}</p>
        ) : (
          <div className="space-y-0.5 max-h-[40vh] overflow-y-auto overscroll-contain">
            {filteredAll.map((user) => (
              <RecipientRow key={user.address} user={user} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecipientRow({ user, onSelect }: { user: SocialUser; onSelect: (u: SocialUser) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(user)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-hover)] active:scale-[0.99]"
    >
      <div className="relative shrink-0">
        <UserAvatar address={user.address} size={32} />
        {user.is_online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-success)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold truncate ${getVipNameClass(user.vip_tier, user.vip_customization?.nameGradient)}`}>
            {user.nickname || shortAddr(user.address)}
          </span>
          <VipBadge tier={user.vip_tier} badgeIcon={user.vip_customization?.badgeIcon} />
        </div>
        <span className="text-[10px] text-[var(--color-text-secondary)] font-mono">
          {shortAddr(user.address)}
        </span>
      </div>
      <ArrowRight size={14} className="text-[var(--color-text-secondary)] shrink-0" />
    </button>
  );
}

// ─── Amount Step ──────────────────────────────────────────

function AmountStep({
  recipient,
  currency,
  setCurrency,
  amount,
  setAmount,
  message,
  setMessage,
  onConfirm,
  onBack,
  coinBalance,
  axmBalance,
}: {
  recipient: SocialUser;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  amount: string;
  setAmount: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  coinBalance: number;
  axmBalance: number;
}) {
  const { t } = useTranslation();
  const presets = currency === 'coin' ? AMOUNT_PRESETS_COIN : AMOUNT_PRESETS_AXM;
  const numAmount = Number(amount) || 0;
  const fee = Math.ceil(numAmount * FEE_BPS / 10000 * 100) / 100;
  const total = numAmount + fee;
  const available = currency === 'coin' ? coinBalance : axmBalance;
  const canConfirm = numAmount >= 1 && total <= available;

  return (
    <div className="space-y-4">
      {/* Back + Recipient header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="shrink-0 rounded-lg p-1 hover:bg-[var(--color-surface-hover)] transition-colors">
          <ChevronLeft size={18} className="text-[var(--color-text-secondary)]" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <UserAvatar address={recipient.address} size={28} />
          <div className="min-w-0">
            <span className={`text-sm font-semibold truncate block ${getVipNameClass(recipient.vip_tier, recipient.vip_customization?.nameGradient)}`}>
              {recipient.nickname || shortAddr(recipient.address)}
            </span>
          </div>
        </div>
      </div>

      {/* Currency toggle */}
      <div className="flex rounded-xl bg-[var(--color-bg)] p-1 border border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => { setCurrency('coin'); setAmount(''); }}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
            currency === 'coin'
              ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-400 shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
        >
          <LaunchTokenIcon size={20} />
          COIN
        </button>
        <button
          type="button"
          onClick={() => { setCurrency('axm'); setAmount(''); }}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
            currency === 'axm'
              ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/20 text-indigo-400 shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
        >
          <GameTokenIcon size={20} />
          AXM
        </button>
      </div>

      {/* Available balance */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-[var(--color-text-secondary)]">
          {t('social.availableBalance', { amount: available.toLocaleString('en-US', { maximumFractionDigits: 2 }) })}
        </span>
        <button
          type="button"
          onClick={() => {
            const maxSendable = Math.floor(available / (1 + FEE_BPS / 10000) * 100) / 100;
            setAmount(String(Math.max(0, maxSendable)));
          }}
          className="text-[var(--color-primary)] font-semibold hover:underline"
        >
          MAX
        </button>
      </div>

      {/* Amount presets */}
      <div className="flex gap-2">
        {presets.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(String(v))}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-all border ${
              amount === String(v)
                ? currency === 'coin'
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                  : 'bg-indigo-500/15 border-indigo-500/50 text-indigo-400'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-secondary)]'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Custom amount input */}
      <div className="relative">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('social.amount')}
          min="1"
          step="0.01"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-3 px-4 text-lg font-bold text-center placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {currency === 'coin' ? <LaunchTokenIcon size={22} /> : <GameTokenIcon size={22} />}
        </div>
      </div>

      {/* Message */}
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('social.messagePlaceholder')}
        maxLength={200}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-2.5 px-4 text-sm placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />

      {/* Fee breakdown */}
      {numAmount >= 1 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-secondary)]">{t('social.youWillSend')}</span>
            <span className="font-semibold">{numAmount} {currency.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-secondary)]">{t('social.fee')}</span>
            <span className="text-[var(--color-warning)] font-medium">-{fee.toFixed(2)} {currency.toUpperCase()}</span>
          </div>
          <div className="border-t border-[var(--color-border)] pt-1.5 flex justify-between">
            <span className="text-[var(--color-text-secondary)] font-semibold">{t('social.totalDeducted')}</span>
            <span className="font-bold">{total.toFixed(2)} {currency.toUpperCase()}</span>
          </div>
        </div>
      )}

      {/* Source info */}
      <div className="flex items-start gap-2 text-[10px] text-[var(--color-text-secondary)] px-1">
        <Info size={12} className="shrink-0 mt-0.5" />
        <span>{currency === 'axm' ? t('social.sourceVault') : t('social.sourceCoin')}</span>
      </div>

      {/* Confirm button */}
      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm}
        className={`w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed ${
          currency === 'coin'
            ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-yellow-400'
            : 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-400 hover:to-violet-400'
        }`}
      >
        <Send size={16} />
        {t('social.confirm')} — {numAmount || 0} {currency.toUpperCase()}
      </button>
    </div>
  );
}

// ─── Result Step ──────────────────────────────────────────

function ResultStep({
  success,
  recipient,
  amount,
  currency,
  errorMsg,
  onClose,
}: {
  success: boolean;
  recipient: SocialUser;
  amount: string;
  currency: Currency;
  errorMsg?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center py-4 text-center space-y-4">
      {success ? (
        <>
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
              <CheckCircle size={36} className="text-emerald-400" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-400">{t('social.transferSuccess')}</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {t('social.transferSuccessDesc', {
                amount,
                currency: currency.toUpperCase(),
                recipient: recipient.nickname || shortAddr(recipient.address),
              })}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
            <UserAvatar address={recipient.address} size={32} />
            <div className="text-left">
              <span className={`text-sm font-semibold ${getVipNameClass(recipient.vip_tier, recipient.vip_customization?.nameGradient)}`}>
                {recipient.nickname || shortAddr(recipient.address)}
              </span>
              <div className="flex items-center gap-1.5 text-lg font-black">
                <span className={currency === 'coin' ? 'text-amber-400' : 'text-indigo-400'}>
                  +{amount} {currency.toUpperCase()}
                </span>
                {currency === 'coin' ? <LaunchTokenIcon size={20} /> : <GameTokenIcon size={20} />}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="h-16 w-16 rounded-full bg-[var(--color-danger)]/10 flex items-center justify-center">
            <XCircle size={36} className="text-[var(--color-danger)]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--color-danger)]">{t('social.transferError')}</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {errorMsg === 'INSUFFICIENT_BALANCE'
                ? (currency === 'axm' ? t('social.insufficientAxm') : t('social.insufficientBalance'))
                : errorMsg || t('social.transferError')}
            </p>
          </div>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl border border-[var(--color-border)] py-3 text-sm font-bold transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        OK
      </button>
    </div>
  );
}

// ─── Main TransferModal ───────────────────────────────────

export function TransferModal({
  open,
  onClose,
  initialRecipient,
  initialCurrency = 'coin',
}: TransferModalProps) {
  const { t } = useTranslation();
  const { address } = useWalletContext();
  const { transfer, loading: transferLoading } = useTransfer();

  // Balances
  const { data: vaultData } = useGetVaultBalance({ query: { enabled: !!address } });
  const vaultBalance = vaultData?.data;
  const axmBalance = fromMicroLaunch(vaultBalance?.available ?? '0');
  const coinBalance = fromMicroLaunch((vaultBalance as any)?.coin_balance ?? '0');

  // State
  const [step, setStep] = useState<Step>('recipient');
  const [recipient, setRecipient] = useState<SocialUser | null>(null);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      if (initialRecipient) {
        setRecipient(initialRecipient);
        setStep('amount');
      } else {
        setRecipient(null);
        setStep('recipient');
      }
      setCurrency(initialCurrency);
      setAmount('');
      setMessage('');
      setResult(null);
    }
  }, [open, initialRecipient, initialCurrency]);

  const handleSelectRecipient = useCallback((user: SocialUser) => {
    setRecipient(user);
    setStep('amount');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!recipient || transferLoading) return;
    const numAmount = Number(amount);
    if (numAmount < 1) return;

    setStep('result');
    const res = await transfer(recipient.address, numAmount, currency, message || undefined);
    setResult(res);
  }, [recipient, amount, currency, message, transfer, transferLoading]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const title = step === 'recipient'
    ? t('social.selectRecipient')
    : step === 'result'
      ? undefined
      : t('social.transferTitle');

  return (
    <Modal open={open} onClose={handleClose} title={title} closeOnOverlayClick={step !== 'result'}>
      {step === 'recipient' && (
        <RecipientStep onSelect={handleSelectRecipient} currentAddress={address ?? null} />
      )}
      {step === 'amount' && recipient && (
        <AmountStep
          recipient={recipient}
          currency={currency}
          setCurrency={setCurrency}
          amount={amount}
          setAmount={setAmount}
          message={message}
          setMessage={setMessage}
          onConfirm={handleConfirm}
          onBack={() => {
            if (initialRecipient) {
              handleClose();
            } else {
              setStep('recipient');
            }
          }}
          coinBalance={coinBalance}
          axmBalance={axmBalance}
        />
      )}
      {step === 'result' && recipient && (
        result ? (
          <ResultStep
            success={result.success}
            recipient={recipient}
            amount={amount}
            currency={currency}
            errorMsg={result.error}
            onClose={handleClose}
          />
        ) : (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 size={28} className="animate-spin text-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">{t('social.sending')}</p>
          </div>
        )
      )}
    </Modal>
  );
}
