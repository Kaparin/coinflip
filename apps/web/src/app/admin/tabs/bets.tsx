'use client';

import { useState, useCallback } from 'react';
import { formatLaunch } from '@coinflip/shared/constants';
import {
  useAdminBets,
  useAdminStuckBets,
  useAdminMissingSecrets,
  useAdminOrphanedBets,
  useAdminImportOrphaned,
  useAdminForceCancel,
  useAdminRecoverSecret,
} from '@/hooks/use-admin';
import {
  shortAddr,
  shortHash,
  timeAgo,
  StatusBadge,
  TableWrapper,
  Pagination,
  SearchInput,
  ActionButton,
} from '../_shared';

const STATUS_FILTERS = ['', 'open', 'accepted', 'accepting', 'canceling', 'revealed', 'canceled', 'timeout_claimed'] as const;

export function BetsTab() {
  const [subTab, setSubTab] = useState<'all' | 'stuck' | 'missing' | 'orphaned'>('all');

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all' as const, label: 'Все ставки' },
          { id: 'stuck' as const, label: 'Зависшие' },
          { id: 'missing' as const, label: 'Без секретов' },
          { id: 'orphaned' as const, label: 'Осиротевшие (чейн)' },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              subTab === id
                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/30'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'all' && <AllBets />}
      {subTab === 'stuck' && <StuckBets />}
      {subTab === 'missing' && <MissingSecrets />}
      {subTab === 'orphaned' && <OrphanedBets />}
    </div>
  );
}

function AllBets() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const bets = useAdminBets(page, 50, status, debouncedSearch);
  const forceCancel = useAdminForceCancel();

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    const timeout = setTimeout(() => { setDebouncedSearch(val); setPage(0); }, 400);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={handleSearch} placeholder="Поиск по ID ставки, хэшу..." />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:outline-none"
        >
          <option value="">Все статусы</option>
          {STATUS_FILTERS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">Создатель</th>
              <th className="text-left px-3 py-2">Принявший</th>
              <th className="text-right px-3 py-2">Сумма</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="text-left px-3 py-2">Секрет</th>
              <th className="text-left px-3 py-2">Создана</th>
              <th className="text-left px-3 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {bets.isLoading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Загрузка...</td></tr>
            ) : !bets.data?.data.length ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Ставки не найдены</td></tr>
            ) : (
              bets.data.data.map((b) => (
                <tr key={b.betId} className="border-b border-[var(--color-border)]/50 last:border-0 hover:bg-[var(--color-surface)]/50">
                  <td className="px-3 py-2 font-mono">#{b.betId}</td>
                  <td className="px-3 py-2 font-mono" title={b.maker}>{shortAddr(b.maker)}</td>
                  <td className="px-3 py-2 font-mono" title={b.acceptor ?? undefined}>{b.acceptor ? shortAddr(b.acceptor) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                  <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                  <td className="px-3 py-2">
                    <span className={b.hasSecret ? 'text-green-400' : 'text-red-400'}>{b.hasSecret ? 'Да' : 'Нет'}</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">{timeAgo(b.createdTime)}</td>
                  <td className="px-3 py-2">
                    {['open', 'accepting', 'canceling', 'accepted'].includes(b.status) && (
                      <ActionButton
                        variant="danger"
                        disabled={forceCancel.isPending}
                        onClick={() => {
                          if (confirm(`Принудительно отменить ставку #${b.betId}?`)) {
                            forceCancel.mutate(Number(b.betId));
                          }
                        }}
                      >
                        Отменить
                      </ActionButton>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {bets.data?.pagination && bets.data.pagination.total > 0 && (
          <Pagination
            page={page}
            total={bets.data.pagination.total}
            limit={bets.data.pagination.limit}
            hasMore={bets.data.pagination.hasMore}
            onPageChange={setPage}
          />
        )}
      </TableWrapper>
    </div>
  );
}

function StuckBets() {
  const stuck = useAdminStuckBets();
  const forceCancel = useAdminForceCancel();

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Ставки в переходных состояниях (создание/принятие/отмена) более 5 минут.
      </p>

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-right px-3 py-2">Сумма</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="text-left px-3 py-2">Возраст</th>
              <th className="text-left px-3 py-2">Хэш TX</th>
              <th className="text-left px-3 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {stuck.isLoading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Загрузка...</td></tr>
            ) : !stuck.data?.length ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-green-400">Зависших ставок нет</td></tr>
            ) : (
              stuck.data.map((b) => (
                <tr key={b.betId} className="border-b border-[var(--color-border)]/50 last:border-0">
                  <td className="px-3 py-2 font-mono">#{b.betId}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                  <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                  <td className="px-3 py-2 text-yellow-400">{b.age}</td>
                  <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]" title={b.txhashCreate}>{shortHash(b.txhashCreate)}</td>
                  <td className="px-3 py-2">
                    <ActionButton
                      variant="danger"
                      disabled={forceCancel.isPending}
                      onClick={() => {
                        if (confirm(`Принудительно отменить зависшую ставку #${b.betId}?`)) {
                          forceCancel.mutate(Number(b.betId));
                        }
                      }}
                    >
                      Принудительная отмена
                    </ActionButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrapper>
    </div>
  );
}

function MissingSecrets() {
  const missing = useAdminMissingSecrets();
  const recoverSecret = useAdminRecoverSecret();

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Принятые ставки без maker_secret — авто-раскрытие не работает. Если &quot;Восстанавливаемый&quot; = Да, секрет можно восстановить из pending_bet_secrets.
      </p>

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-right px-3 py-2">Сумма</th>
              <th className="text-left px-3 py-2">Создана</th>
              <th className="text-left px-3 py-2">Принятие</th>
              <th className="text-left px-3 py-2">Восстанавливаемый</th>
              <th className="text-left px-3 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {missing.isLoading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Загрузка...</td></tr>
            ) : !missing.data?.length ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-green-400">Все секреты на месте</td></tr>
            ) : (
              missing.data.map((b) => (
                <tr key={b.betId} className="border-b border-[var(--color-border)]/50 last:border-0">
                  <td className="px-3 py-2 font-mono">#{b.betId}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">{timeAgo(b.createdTime)}</td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">{timeAgo(b.acceptedTime)}</td>
                  <td className="px-3 py-2">
                    <span className={b.secretRecoverable ? 'text-green-400' : 'text-red-400'}>
                      {b.secretRecoverable ? 'Да' : 'Нет'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {b.secretRecoverable && (
                      <ActionButton
                        variant="success"
                        disabled={recoverSecret.isPending}
                        onClick={() => recoverSecret.mutate(Number(b.betId))}
                      >
                        Восстановить
                      </ActionButton>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrapper>
    </div>
  );
}

function OrphanedBets() {
  const orphaned = useAdminOrphanedBets();
  const importOrphaned = useAdminImportOrphaned();

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Ставки есть в блокчейне, но отсутствуют в БД. Обычно вызвано ошибками фоновых задач.
      </p>

      {orphaned.data && (
        <div className="flex gap-3 text-xs">
          <span className="text-[var(--color-text-secondary)]">Чейн: <strong>{orphaned.data.chainTotal}</strong> open</span>
          <span className="text-[var(--color-text-secondary)]">БД: <strong>{orphaned.data.dbTotal}</strong> total</span>
          <span className={orphaned.data.orphanedCount > 0 ? 'text-yellow-400 font-bold' : 'text-green-400'}>
            Осиротевшие: {orphaned.data.orphanedCount}
          </span>
        </div>
      )}

      <TableWrapper>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
              <th className="text-left px-3 py-2">ID (чейн)</th>
              <th className="text-left px-3 py-2">Создатель</th>
              <th className="text-right px-3 py-2">Сумма</th>
              <th className="text-left px-3 py-2">Секрет</th>
              <th className="text-left px-3 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {orphaned.isLoading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--color-text-secondary)]">Запрос к чейну...</td></tr>
            ) : !orphaned.data?.orphaned.length ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-green-400">Осиротевших ставок нет</td></tr>
            ) : (
              orphaned.data.orphaned.map((b) => (
                <tr key={b.chainBetId} className="border-b border-[var(--color-border)]/50 last:border-0">
                  <td className="px-3 py-2 font-mono">#{b.chainBetId}</td>
                  <td className="px-3 py-2 font-mono" title={b.maker}>{shortAddr(b.maker)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatLaunch(b.amount)}</td>
                  <td className="px-3 py-2">
                    <span className={b.secretAvailable ? 'text-green-400' : 'text-red-400'}>
                      {b.secretAvailable ? 'Доступен' : 'Отсутствует'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ActionButton
                      variant="success"
                      disabled={importOrphaned.isPending}
                      onClick={() => {
                        if (confirm(`Импортировать ставку #${b.chainBetId} из чейна в БД?`)) {
                          importOrphaned.mutate(b.chainBetId);
                        }
                      }}
                    >
                      Импорт
                    </ActionButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrapper>
    </div>
  );
}
