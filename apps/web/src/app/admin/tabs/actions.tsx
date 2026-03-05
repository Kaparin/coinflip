'use client';

import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
  useAdminUnlockFunds,
  useAdminForceCancel,
  useAdminRecoverSecret,
  useAdminImportOrphaned,
  useAdminHealSystem,
} from '@/hooks/use-admin';
import type { HealResult } from '@/hooks/use-admin';
import { useWalletContext } from '@/contexts/wallet-context';
import { signCoinflipAdminSweep } from '@/lib/wallet-signer';
import { ACTIVE_CONTRACT } from '@/lib/constants';

export function ActionsTab() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Ручные действия админа для исправления зависших состояний. Используйте осторожно — операции напрямую изменяют БД.
      </p>

      <HealSystemAction />
      <ContractSweepAction />
      <UnlockFundsAction />
      <ForceCancelAction />
      <RecoverSecretAction />
      <ImportOrphanedAction />
    </div>
  );
}

function HealSystemAction() {
  const heal = useAdminHealSystem();
  const [result, setResult] = useState<HealResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleHeal = async () => {
    setResult(null);
    setError(null);
    try {
      const res = await heal.mutateAsync();
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Heal failed');
    }
  };

  const counters: Array<{ label: string; key: keyof HealResult; color: string }> = [
    { label: 'Секретов восстановлено', key: 'secretsRecovered', color: 'text-green-400' },
    { label: 'Синхронизировано с чейна', key: 'syncedFromChain', color: 'text-blue-400' },
    { label: 'Раскрытий запущено', key: 'revealsTriggered', color: 'text-yellow-400' },
    { label: 'Таймаутов получено', key: 'timeoutsClaimed', color: 'text-orange-400' },
    { label: 'Переходов откачено', key: 'transitionalReverted', color: 'text-purple-400' },
    { label: 'Средств разблокировано', key: 'fundsUnlocked', color: 'text-cyan-400' },
    { label: 'Сирот импортировано', key: 'orphansImported', color: 'text-pink-400' },
  ];

  return (
    <div className="rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-surface)] p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold">Исцеление системы</h3>
        <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">
          Одним нажатием: восстановление секретов, синхронизация с чейном, запуск раскрытий, клейм таймаутов, откат зависших переходов, разблокировка средств, импорт недостающих ставок.
        </p>
      </div>

      <button
        type="button"
        disabled={heal.isPending}
        onClick={handleHeal}
        className="w-full rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-bold disabled:opacity-40 transition-opacity"
      >
        {heal.isPending ? 'Исцеление...' : 'Исцелить систему'}
      </button>

      {result && (
        <div className="space-y-2 text-xs">
          <p className="font-bold">{result.message} ({result.duration})</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {counters.map(({ label, key, color }) => {
              const val = result[key] as number;
              return (
                <div key={key} className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">{label}</span>
                  <span className={val > 0 ? color : 'text-[var(--color-text-secondary)]'}>{val}</span>
                </div>
              );
            })}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[var(--color-danger)] font-bold">Ошибки:</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-[var(--color-danger)] text-[11px] break-all">{err}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

function ContractSweepAction() {
  const { address, getWallet } = useWalletContext();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSweep = useCallback(async () => {
    if (!address || loading) return;
    setResult(null);
    setLoading(true);
    try {
      const wallet = await getWallet();
      if (!wallet) throw new Error('Wallet not available');
      const res = await signCoinflipAdminSweep(wallet, address);
      setResult({ type: 'success', msg: `Swept orphaned tokens. TX: ${res.txHash}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ type: 'error', msg });
    } finally {
      setLoading(false);
    }
  }, [address, getWallet, loading]);

  return (
    <ActionCard
      title="Сбор осиротевших COIN из контракта"
      description={`Восстановление COIN токенов, застрявших в контракте CoinFlip и не привязанных к балансам. Контракт: ${ACTIVE_CONTRACT.slice(0, 16)}...`}
    >
      <button
        type="button"
        disabled={loading}
        onClick={handleSweep}
        className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold disabled:opacity-40"
      >
        {loading ? <><Loader2 size={12} className="animate-spin" /> Сбор...</> : 'Собрать осиротевшие токены'}
      </button>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function UnlockFundsAction() {
  const unlock = useAdminUnlockFunds();
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async () => {
    setResult(null);
    if (!userId || !amount) { setResult({ type: 'error', msg: 'Оба поля обязательны' }); return; }
    try {
      const res = await unlock.mutateAsync({ userId, amount });
      setResult({ type: 'success', msg: res.message });
      setUserId('');
      setAmount('');
    } catch (err) {
      setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <ActionCard
      title="Разблокировать застрявшие средства"
      description="Принудительная разблокировка средств пользователя. Используйте, когда заблокированный баланс есть, но активных ставок нет (видно в Диагностике)."
    >
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="ID пользователя (UUID)"
          className="flex-1 min-w-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Сумма (micro COIN)"
          className="w-40 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <button
          type="button"
          disabled={unlock.isPending}
          onClick={handleSubmit}
          className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-bold disabled:opacity-40"
        >
          {unlock.isPending ? 'Разблокировка...' : 'Разблокировать'}
        </button>
      </div>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function ForceCancelAction() {
  const forceCancel = useAdminForceCancel();
  const [betId, setBetId] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async () => {
    setResult(null);
    if (!betId) { setResult({ type: 'error', msg: 'Требуется ID ставки' }); return; }
    try {
      const res = await forceCancel.mutateAsync(Number(betId));
      setResult({ type: 'success', msg: res.message });
      setBetId('');
    } catch (err) {
      setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <ActionCard
      title="Принудительная отмена ставки"
      description="Принудительный перевод ставки в статус 'canceled' и разблокировка средств обоих участников. Для зависших ставок, которые sweep не может решить."
    >
      <div className="flex gap-3">
        <input
          type="number"
          value={betId}
          onChange={(e) => setBetId(e.target.value)}
          placeholder="ID ставки"
          className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <button
          type="button"
          disabled={forceCancel.isPending}
          onClick={handleSubmit}
          className="rounded-xl bg-[var(--color-danger)] px-4 py-2 text-xs font-bold disabled:opacity-40"
        >
          {forceCancel.isPending ? 'Отмена...' : 'Принудительно отменить'}
        </button>
      </div>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function RecoverSecretAction() {
  const recover = useAdminRecoverSecret();
  const [betId, setBetId] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async () => {
    setResult(null);
    if (!betId) { setResult({ type: 'error', msg: 'Требуется ID ставки' }); return; }
    try {
      const res = await recover.mutateAsync(Number(betId));
      setResult({ type: 'success', msg: res.message });
      setBetId('');
    } catch (err) {
      setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <ActionCard
      title="Восстановить секрет"
      description="Восстановление maker_secret из таблицы pending_bet_secrets. Активирует авто-раскрытие для импортированных ставок без секретов."
    >
      <div className="flex gap-3">
        <input
          type="number"
          value={betId}
          onChange={(e) => setBetId(e.target.value)}
          placeholder="ID ставки"
          className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <button
          type="button"
          disabled={recover.isPending}
          onClick={handleSubmit}
          className="rounded-xl bg-green-600 px-4 py-2 text-xs font-bold disabled:opacity-40"
        >
          {recover.isPending ? 'Восстановление...' : 'Восстановить секрет'}
        </button>
      </div>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function ImportOrphanedAction() {
  const importOrphaned = useAdminImportOrphaned();
  const [chainBetId, setChainBetId] = useState('');
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = async () => {
    setResult(null);
    if (!chainBetId) { setResult({ type: 'error', msg: 'Требуется ID ставки из чейна' }); return; }
    try {
      const res = await importOrphaned.mutateAsync(Number(chainBetId));
      setResult({ type: 'success', msg: res.message });
      setChainBetId('');
    } catch (err) {
      setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed' });
    }
  };

  return (
    <ActionCard
      title="Импорт осиротевшей ставки"
      description="Импорт конкретной ставки из блокчейна в БД. Автоматически восстанавливает секрет из pending_bet_secrets если доступен."
    >
      <div className="flex gap-3">
        <input
          type="number"
          value={chainBetId}
          onChange={(e) => setChainBetId(e.target.value)}
          placeholder="ID ставки (чейн)"
          className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none font-mono"
        />
        <button
          type="button"
          disabled={importOrphaned.isPending}
          onClick={handleSubmit}
          className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-bold disabled:opacity-40"
        >
          {importOrphaned.isPending ? 'Импорт...' : 'Импорт из чейна'}
        </button>
      </div>
      {result && <ResultMsg type={result.type} msg={result.msg} />}
    </ActionCard>
  );
}

function ActionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ResultMsg({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <p className={`text-xs mt-1 ${type === 'success' ? 'text-green-400' : 'text-[var(--color-danger)]'}`}>
      {msg}
    </p>
  );
}
