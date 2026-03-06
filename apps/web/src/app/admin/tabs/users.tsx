'use client';

import { useState, useCallback } from 'react';
import { formatLaunch, toMicroLaunch } from '@coinflip/shared/constants';
import { useAdminUsers, useAdminUserDetail, useAdminAdjustCoin, useAdminEconomyOverview } from '@/hooks/use-admin';
import {
  StatCard,
  shortAddr,
  timeAgo,
  StatusBadge,
  TableWrapper,
  Pagination,
  SearchInput,
} from '../_shared';

export function UsersTab() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const users = useAdminUsers(page, 50, debouncedSearch);
  const userDetail = useAdminUserDetail(selectedUserId);
  const economy = useAdminEconomyOverview();

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    const timeout = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(0);
    }, 400);
    return () => clearTimeout(timeout);
  }, []);

  if (selectedUserId) {
    return (
      <UserDetailView
        userId={selectedUserId}
        detail={userDetail.data ?? null}
        isLoading={userDetail.isLoading}
        onBack={() => setSelectedUserId(null)}
      />
    );
  }

  const eco = economy.data;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      {eco && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Всего юзеров" value={users.data?.pagination.total ?? '...'} />
          <StatCard label="С AXM балансом" value={eco.vaultTotals.usersWithBalance} />
          <StatCard label="COIN холдеров" value={eco.coin.holdersCount} />
          <StatCard
            label="COIN в обращении"
            value={formatLaunch(eco.coin.totalCirculating)}
            sub="виртуальных COIN"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Пользователи ({users.data?.pagination.total ?? '...'})
        </h2>
        <SearchInput
          value={search}
          onChange={handleSearch}
          placeholder="Поиск по адресу или нику..."
        />
      </div>

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">Адрес</th>
              <th className="text-left px-3 py-2">Ник</th>
              <th className="text-right px-3 py-2">AXM баланс</th>
              <th className="text-right px-3 py-2">AXM locked</th>
              <th className="text-right px-3 py-2">COIN</th>
              <th className="text-right px-3 py-2">Ставки</th>
              <th className="text-left px-3 py-2">Рег.</th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-secondary)]">Загрузка...</td></tr>
            ) : !users.data?.data.length ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-text-secondary)]">Пользователи не найдены</td></tr>
            ) : (
              users.data.data.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className="border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-surface)]/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2.5 font-mono" title={u.address}>{shortAddr(u.address)}</td>
                  <td className="px-3 py-2.5">{u.nickname || <span className="text-[var(--color-text-secondary)]">--</span>}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatLaunch(u.axmBalance)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${BigInt(u.axmLocked) > 0n ? 'text-yellow-400' : ''}`}>
                    {formatLaunch(u.axmLocked)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono ${BigInt(u.coinBalance) > 0n ? 'text-amber-400' : 'text-[var(--color-text-secondary)]'}`}>
                    {formatLaunch(u.coinBalance)}
                  </td>
                  <td className="px-3 py-2.5 text-right">{u.totalBets}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">{timeAgo(u.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {users.data?.pagination && users.data.pagination.total > 0 && (
          <Pagination
            page={page}
            total={users.data.pagination.total}
            limit={users.data.pagination.limit}
            hasMore={users.data.pagination.hasMore}
            onPageChange={setPage}
          />
        )}
      </TableWrapper>
    </div>
  );
}

function UserDetailView({ userId, detail, isLoading, onBack }: {
  userId: string;
  detail: import('@/hooks/use-admin').UserDetail | null;
  isLoading: boolean;
  onBack: () => void;
}) {
  if (isLoading || !detail) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-xs text-[var(--color-primary)] hover:underline">&larr; К списку</button>
        <div className="text-center py-16 text-[var(--color-text-secondary)]">Загрузка данных пользователя...</div>
      </div>
    );
  }

  const avail = BigInt(detail.vault.available);
  const effectiveAxm = avail; // already includes bonus-offchainSpent in DB query for detail

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-xs text-[var(--color-primary)] hover:underline">&larr; К списку</button>

      {/* User Info */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
        <p className="text-sm font-bold">{detail.user.nickname || 'Без ника'}</p>
        <p className="text-xs font-mono text-[var(--color-text-secondary)]">{detail.user.address}</p>
        <p className="text-[10px] text-[var(--color-text-secondary)]">ID: {detail.user.id}</p>
        <p className="text-[10px] text-[var(--color-text-secondary)]">Joined: {detail.user.createdAt ? new Date(detail.user.createdAt).toLocaleString() : '--'}</p>
      </div>

      {/* Balances — AXM + COIN side by side */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">Балансы</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="AXM (БД)" value={formatLaunch(detail.vault.available)} sub="доступно" />
          <StatCard label="AXM locked" value={formatLaunch(detail.vault.locked)} warn={BigInt(detail.vault.locked) > 0n} />
          {detail.chainVault && (
            <>
              <StatCard label="AXM (чейн)" value={formatLaunch(detail.chainVault.available)} sub="доступно" />
              <StatCard label="AXM locked (чейн)" value={formatLaunch(detail.chainVault.locked)} warn={BigInt(detail.chainVault.locked) > 0n} />
            </>
          )}
          <StatCard label="COIN" value={formatLaunch(detail.vault.coinBalance)} sub="виртуальный" />
        </div>
        {detail.chainVault && (BigInt(detail.vault.locked) !== BigInt(detail.chainVault.locked)) && (
          <p className="text-[11px] text-amber-500">Расхождение БД/Чейн -- запустите sync-balances для исправления</p>
        )}
      </div>

      {/* COIN Balance Management */}
      <CoinBalanceSection userId={userId} coinBalance={detail.vault.coinBalance} />

      {/* Chain user bets */}
      {detail.chainUserBets?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Ставки в чейне ({detail.chainUserBets.length})
          </p>
          <TableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">AXM</th>
                  <th className="text-left px-3 py-2">Maker</th>
                  <th className="text-left px-3 py-2">Acceptor</th>
                </tr>
              </thead>
              <tbody>
                {detail.chainUserBets.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <td className="px-3 py-2 font-mono">#{b.id}</td>
                    <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">{shortAddr(b.maker)}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">{b.acceptor ? shortAddr(b.acceptor) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        </div>
      )}

      {/* DB Bets */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Ставки в БД ({detail.bets.length})
        </h3>
        <TableWrapper>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                <th className="text-left px-3 py-2">ID</th>
                <th className="text-right px-3 py-2">AXM</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Side</th>
                <th className="text-left px-3 py-2">Secret</th>
                <th className="text-left px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {detail.bets.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--color-text-secondary)]">Нет ставок</td></tr>
              ) : (
                detail.bets.map((b) => (
                  <tr key={b.betId} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <td className="px-3 py-2 font-mono">#{b.betId}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                    <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-2">{b.makerSide || '--'}</td>
                    <td className="px-3 py-2">
                      <span className={b.makerSecret === 'present' ? 'text-green-400' : 'text-red-400'}>
                        {b.makerSecret === 'present' ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">{timeAgo(b.createdTime)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrapper>
      </div>
    </div>
  );
}

function CoinBalanceSection({ userId, coinBalance }: { userId: string; coinBalance: string }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const adjustCoin = useAdminAdjustCoin();

  const handleAdjust = (action: 'credit' | 'debit') => {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    const micro = toMicroLaunch(num);
    adjustCoin.mutate({ userId, amount: micro, action, reason: reason || undefined }, {
      onSuccess: () => { setAmount(''); setReason(''); },
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">Управление COIN</p>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <StatCard label="COIN баланс" value={formatLaunch(coinBalance)} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Сумма (COIN)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              min={0}
              step={1}
              className="w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm tabular-nums focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Причина</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Тест / награда / ..."
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => handleAdjust('credit')}
            disabled={adjustCoin.isPending || !amount}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50 transition-colors"
          >
            + Начислить
          </button>
          <button
            type="button"
            onClick={() => handleAdjust('debit')}
            disabled={adjustCoin.isPending || !amount}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50 transition-colors"
          >
            - Списать
          </button>
        </div>
        {adjustCoin.isError && (
          <p className="text-[11px] text-red-400">{(adjustCoin.error as Error).message}</p>
        )}
        {adjustCoin.isSuccess && (
          <p className="text-[11px] text-emerald-400">Баланс обновлён: {formatLaunch((adjustCoin.data as { coinBalance: string }).coinBalance)} COIN</p>
        )}
      </div>
    </div>
  );
}
