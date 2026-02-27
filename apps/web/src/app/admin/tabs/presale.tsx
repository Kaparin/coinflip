'use client';

import { useState, useCallback } from 'react';
import { ShoppingCart, Power, PowerOff, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Loader2, CheckCircle, AlertTriangle, TrendingUp, Coins, Settings } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/wallet-context';
import { usePresaleConfig, usePresaleStatus } from '@/hooks/use-presale';
import { signPresaleUpdateConfig, signPresaleWithdrawAxm, signPresaleWithdrawCoin } from '@/lib/wallet-signer';
import { PRESALE_CONTRACT } from '@/lib/constants';

export function PresaleTab() {
  const { address, getWallet } = useWalletContext();
  const queryClient = useQueryClient();
  const { data: config, isLoading: configLoading, refetch: refetchConfig } = usePresaleConfig();
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = usePresaleStatus();

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Rate editing
  const [editRate, setEditRate] = useState(false);
  const [rateNum, setRateNum] = useState('');
  const [rateDenom, setRateDenom] = useState('');

  // Max per tx editing
  const [editMaxTx, setEditMaxTx] = useState(false);
  const [maxPerTx, setMaxPerTx] = useState('');

  // Withdraw amounts
  const [withdrawAxmAmount, setWithdrawAxmAmount] = useState('');
  const [withdrawCoinAmount, setWithdrawCoinAmount] = useState('');

  const isLoading = configLoading || statusLoading;
  const isEnabled = status?.enabled ?? false;

  const fmtMicro = (micro: string) => (Number(micro) / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const clearMessages = () => { setError(null); setSuccess(null); };

  const refreshAll = useCallback(() => {
    refetchConfig();
    refetchStatus();
    queryClient.invalidateQueries({ queryKey: ['presale'] });
  }, [refetchConfig, refetchStatus, queryClient]);

  const handleToggleEnabled = useCallback(async () => {
    if (!address || loading) return;
    clearMessages();
    setLoading('toggle');
    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');
      await signPresaleUpdateConfig(wallet, address, { enabled: !isEnabled });
      setSuccess(isEnabled ? 'Presale disabled' : 'Presale enabled');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [address, getWallet, isEnabled, loading, refreshAll]);

  const handleUpdateRate = useCallback(async () => {
    if (!address || loading) return;
    const num = parseInt(rateNum);
    const denom = parseInt(rateDenom);
    if (!num || !denom || num <= 0 || denom <= 0) {
      setError('Rate numerator and denominator must be positive integers');
      return;
    }
    clearMessages();
    setLoading('rate');
    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');
      await signPresaleUpdateConfig(wallet, address, { rate_num: num, rate_denom: denom });
      setSuccess(`Rate updated to ${num}/${denom}`);
      setEditRate(false);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [address, getWallet, rateNum, rateDenom, loading, refreshAll]);

  const handleUpdateMaxTx = useCallback(async () => {
    if (!address || loading) return;
    const humanAmount = parseFloat(maxPerTx);
    if (isNaN(humanAmount) || humanAmount < 0) {
      setError('Invalid amount');
      return;
    }
    const micro = String(Math.floor(humanAmount * 1_000_000));
    clearMessages();
    setLoading('maxTx');
    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');
      await signPresaleUpdateConfig(wallet, address, { max_per_tx: micro });
      setSuccess(`Max per tx updated to ${humanAmount} AXM`);
      setEditMaxTx(false);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [address, getWallet, maxPerTx, loading, refreshAll]);

  const handleWithdrawAxm = useCallback(async () => {
    if (!address || loading) return;
    const humanAmount = parseFloat(withdrawAxmAmount);
    if (!humanAmount || humanAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    const micro = String(Math.floor(humanAmount * 1_000_000));
    clearMessages();
    setLoading('withdrawAxm');
    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');
      await signPresaleWithdrawAxm(wallet, address, micro);
      setSuccess(`Withdrew ${humanAmount} AXM`);
      setWithdrawAxmAmount('');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [address, getWallet, withdrawAxmAmount, loading, refreshAll]);

  const handleWithdrawAllAxm = useCallback(async () => {
    if (!address || loading) return;
    clearMessages();
    setLoading('withdrawAxm');
    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');
      // 0 = withdraw all
      await signPresaleWithdrawAxm(wallet, address, '0');
      setSuccess('Withdrew all AXM');
      setWithdrawAxmAmount('');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [address, getWallet, loading, refreshAll]);

  const handleWithdrawCoin = useCallback(async () => {
    if (!address || loading) return;
    const humanAmount = parseFloat(withdrawCoinAmount);
    if (!humanAmount || humanAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    const micro = String(Math.floor(humanAmount * 1_000_000));
    clearMessages();
    setLoading('withdrawCoin');
    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');
      await signPresaleWithdrawCoin(wallet, address, micro);
      setSuccess(`Withdrew ${humanAmount} COIN`);
      setWithdrawCoinAmount('');
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [address, getWallet, withdrawCoinAmount, loading, refreshAll]);

  if (!PRESALE_CONTRACT) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Presale contract not configured. Set <code>NEXT_PUBLIC_PRESALE_CONTRACT</code> in environment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-lg font-bold">Presale Management</h2>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-medium hover:bg-[var(--color-surface-hover)]"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2.5">
          <AlertTriangle size={14} className="text-[var(--color-danger)] shrink-0" />
          <p className="text-xs text-[var(--color-danger)]">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-4 py-2.5">
          <CheckCircle size={14} className="text-[var(--color-success)] shrink-0" />
          <p className="text-xs text-[var(--color-success)]">{success}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <>
          {/* Status + Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">Status</p>
              <p className={`text-sm font-bold ${isEnabled ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                {isEnabled ? 'Active' : 'Disabled'}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">Rate</p>
              <p className="text-sm font-bold">1 AXM = {(status?.rate_num ?? 1) / (status?.rate_denom ?? 1)} COIN</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">COIN Pool</p>
              <p className="text-sm font-bold">{fmtMicro(status?.coin_available ?? '0')}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[10px] text-[var(--color-text-secondary)]">AXM Collected</p>
              <p className="text-sm font-bold">{fmtMicro(status?.axm_balance ?? '0')}</p>
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <TrendingUp size={14} className="text-[var(--color-text-secondary)]" />
              <div>
                <p className="text-[10px] text-[var(--color-text-secondary)]">Total AXM Raised</p>
                <p className="text-sm font-bold">{fmtMicro(config?.total_axm_received ?? '0')} AXM</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <Coins size={14} className="text-[var(--color-text-secondary)]" />
              <div>
                <p className="text-[10px] text-[var(--color-text-secondary)]">Total COIN Sold</p>
                <p className="text-sm font-bold">{fmtMicro(config?.total_coin_sold ?? '0')} COIN</p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Settings size={14} />
              Controls
            </h3>

            {/* Toggle Enable/Disable */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div>
                <p className="text-xs font-medium">Presale Status</p>
                <p className="text-[10px] text-[var(--color-text-secondary)]">
                  {isEnabled ? 'Presale is active and visible to users' : 'Presale is disabled and hidden from users'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleEnabled}
                disabled={!!loading}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  isEnabled
                    ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20'
                    : 'bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20'
                } disabled:opacity-50`}
              >
                {loading === 'toggle' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : isEnabled ? (
                  <><PowerOff size={12} /> Disable</>
                ) : (
                  <><Power size={12} /> Enable</>
                )}
              </button>
            </div>

            {/* Rate */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Exchange Rate</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    Current: {config?.rate_num ?? 1} / {config?.rate_denom ?? 1} (1 AXM = {(config?.rate_num ?? 1) / (config?.rate_denom ?? 1)} COIN)
                  </p>
                </div>
                {!editRate && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditRate(true);
                      setRateNum(String(config?.rate_num ?? 1));
                      setRateDenom(String(config?.rate_denom ?? 1));
                    }}
                    className="text-[10px] font-medium text-[var(--color-primary)] hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editRate && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={rateNum}
                    onChange={(e) => setRateNum(e.target.value)}
                    placeholder="Numerator"
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                  />
                  <span className="text-xs font-bold">/</span>
                  <input
                    type="number"
                    value={rateDenom}
                    onChange={(e) => setRateDenom(e.target.value)}
                    placeholder="Denominator"
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleUpdateRate}
                    disabled={!!loading}
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                  >
                    {loading === 'rate' ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditRate(false)}
                    className="text-xs text-[var(--color-text-secondary)] hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Max Per Tx */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Max Per Transaction</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">
                    Current: {config?.max_per_tx === '0' ? 'No limit' : `${fmtMicro(config?.max_per_tx ?? '0')} AXM`}
                  </p>
                </div>
                {!editMaxTx && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditMaxTx(true);
                      setMaxPerTx(config?.max_per_tx === '0' ? '0' : String(Number(config?.max_per_tx ?? '0') / 1_000_000));
                    }}
                    className="text-[10px] font-medium text-[var(--color-primary)] hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editMaxTx && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={maxPerTx}
                    onChange={(e) => setMaxPerTx(e.target.value)}
                    placeholder="0 = no limit"
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">AXM</span>
                  <button
                    type="button"
                    onClick={handleUpdateMaxTx}
                    disabled={!!loading}
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                  >
                    {loading === 'maxTx' ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMaxTx(false)}
                    className="text-xs text-[var(--color-text-secondary)] hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Withdraw AXM */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <ArrowUpFromLine size={12} />
                Withdraw Collected AXM
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={withdrawAxmAmount}
                  onChange={(e) => setWithdrawAxmAmount(e.target.value)}
                  placeholder="Amount in AXM"
                  className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={handleWithdrawAxm}
                  disabled={!!loading}
                  className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                >
                  {loading === 'withdrawAxm' ? <Loader2 size={12} className="animate-spin" /> : 'Withdraw'}
                </button>
                <button
                  type="button"
                  onClick={handleWithdrawAllAxm}
                  disabled={!!loading}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
                >
                  All
                </button>
              </div>
            </div>

            {/* Withdraw COIN */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <ArrowDownToLine size={12} />
                Withdraw Unsold COIN
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={withdrawCoinAmount}
                  onChange={(e) => setWithdrawCoinAmount(e.target.value)}
                  placeholder="Amount in COIN"
                  className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={handleWithdrawCoin}
                  disabled={!!loading}
                  className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                >
                  {loading === 'withdrawCoin' ? <Loader2 size={12} className="animate-spin" /> : 'Withdraw'}
                </button>
              </div>
            </div>
          </div>

          {/* Contract info */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p className="text-[10px] text-[var(--color-text-secondary)]">Contract Address</p>
            <p className="text-xs font-mono break-all">{PRESALE_CONTRACT}</p>
          </div>
        </>
      )}
    </div>
  );
}
