'use client';

import { useState, useCallback } from 'react';
import { formatLaunch } from '@coinflip/shared/constants';
import { useAdminUsers, useAdminUserDetail } from '@/hooks/use-admin';
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

  return (
    <div className="space-y-4">
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
              <th className="text-left px-4 py-2">Адрес</th>
              <th className="text-left px-4 py-2">Ник</th>
              <th className="text-right px-4 py-2">Доступно</th>
              <th className="text-right px-4 py-2">Заблокировано</th>
              <th className="text-right px-4 py-2">Ставки</th>
              <th className="text-left px-4 py-2">Дата рег.</th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--color-text-secondary)]">Загрузка...</td></tr>
            ) : !users.data?.data.length ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--color-text-secondary)]">Пользователи не найдены</td></tr>
            ) : (
              users.data.data.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className="border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-surface)]/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono" title={u.address}>{shortAddr(u.address)}</td>
                  <td className="px-4 py-2.5">{u.nickname || <span className="text-[var(--color-text-secondary)]">—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatLaunch(u.vault.available)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${BigInt(u.vault.locked) > 0n ? 'text-yellow-400' : ''}`}>
                    {formatLaunch(u.vault.locked)}
                  </td>
                  <td className="px-4 py-2.5 text-right">{u.totalBets}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{timeAgo(u.createdAt)}</td>
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

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-xs text-[var(--color-primary)] hover:underline">&larr; К списку</button>

      {/* User Info */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2">
        <p className="text-sm font-bold">{detail.user.nickname || 'Без ника'}</p>
        <p className="text-xs font-mono text-[var(--color-text-secondary)]">{detail.user.address}</p>
        <p className="text-[10px] text-[var(--color-text-secondary)]">ID: {detail.user.id}</p>
        <p className="text-[10px] text-[var(--color-text-secondary)]">Joined: {detail.user.createdAt ? new Date(detail.user.createdAt).toLocaleString() : '—'}</p>
      </div>

      {/* Vault — DB vs Chain (chain is source of truth for UI) */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">Хранилище</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="БД доступно" value={formatLaunch(detail.vault.available)} />
          <StatCard label="БД заблокировано" value={formatLaunch(detail.vault.locked)} warn={BigInt(detail.vault.locked) > 0n} />
          {detail.chainVault && (
            <>
              <StatCard label="Чейн доступно" value={formatLaunch(detail.chainVault.available)} />
              <StatCard label="Чейн заблокировано" value={formatLaunch(detail.chainVault.locked)} warn={BigInt(detail.chainVault.locked) > 0n} />
            </>
          )}
        </div>
        {detail.chainVault && (BigInt(detail.vault.locked) !== BigInt(detail.chainVault.locked)) && (
          <p className="text-[11px] text-amber-500">Расхождение БД/Чейн — запустите sync-balances для исправления</p>
        )}
      </div>

      {/* Chain user bets — bets on chain where user is maker or acceptor */}
      {detail.chainUserBets?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Ставки в чейне (user_bets)
          </p>
          <TableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <th className="text-left px-3 py-2">ID</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Amount</th>
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
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">{b.acceptor ? shortAddr(b.acceptor) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            Заблокированные средства из активных ставок. Разрешается через отмену, раскрытие или claim_timeout.
          </p>
        </div>
      )}

      {/* Bets */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Ставки ({detail.bets.length})
        </h3>
        <TableWrapper>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                <th className="text-left px-3 py-2">ID</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Сторона</th>
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
                    <td className="px-3 py-2">{b.makerSide || '—'}</td>
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
