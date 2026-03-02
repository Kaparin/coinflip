'use client';

import { formatLaunch } from '@coinflip/shared/constants';
import { useAdminDiagnostics, useAdminPendingSecrets } from '@/hooks/use-admin';
import { StatCard, shortAddr, timeAgo, TableWrapper } from '../_shared';

export function DiagnosticsTab() {
  const diagnostics = useAdminDiagnostics();
  const pendingSecrets = useAdminPendingSecrets();

  const d = diagnostics.data;

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Проверка системы — авто-обновление каждые 30 секунд.
        {d && <span className="ml-2">Обновлено: {new Date(d.timestamp).toLocaleTimeString()}</span>}
      </p>

      {/* Bet Status Distribution */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Распределение статусов ставок
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          <StatCard label="Всего" value={d?.bets.total ?? '...'} />
          <StatCard label="Открытых" value={d?.bets.open ?? '...'} />
          <StatCard label="Принятых" value={d?.bets.accepted ?? '...'} />
          <StatCard label="Раскрытых" value={d?.bets.revealed ?? '...'} />
          <StatCard label="Отменённых" value={d?.bets.canceled ?? '...'} />
          <StatCard label="Таймаут" value={d?.bets.timeout ?? '...'} />
          <StatCard label="Принимаются" value={d?.bets.accepting ?? '...'} warn={(d?.bets.accepting ?? 0) > 0} />
          <StatCard label="Отменяются" value={d?.bets.canceling ?? '...'} warn={(d?.bets.canceling ?? 0) > 0} />
          <StatCard label="Создаются" value={d?.bets.creating ?? '...'} warn={(d?.bets.creating ?? 0) > 0} />
          <StatCard label="Без секретов" value={d?.bets.missingSecrets ?? '...'} warn={(d?.bets.missingSecrets ?? 0) > 0} sub="принятые без секрета" />
        </div>
      </section>

      {/* Vault Health */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Здоровье хранилища
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Юзеры с балансом" value={d?.vault.totalUsers ?? '...'} />
          <StatCard label="Всего доступно" value={d ? formatLaunch(d.vault.totalAvailable) : '...'} />
          <StatCard label="Всего заблокировано" value={d ? formatLaunch(d.vault.totalLocked) : '...'} />
          <StatCard label="С заблокированными" value={d?.vault.usersWithLocked ?? '...'} />
          <StatCard label="Отрицательный баланс" value={d?.vault.negativeAvailable ?? '...'} warn={(d?.vault.negativeAvailable ?? 0) > 0} />
          <StatCard label="Отрицательная блокировка" value={d?.vault.negativeLocked ?? '...'} warn={(d?.vault.negativeLocked ?? 0) > 0} />
        </div>
      </section>

      {/* Stuck Locked Funds */}
      {d?.stuckLockedFunds && d.stuckLockedFunds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-danger)]">
            Застрявшие средства ({d.stuckLockedFunds.length})
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Пользователи с заблокированным балансом, но без активных ставок. Средства фактически заморожены.
          </p>
          <TableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <th className="text-left px-3 py-2">Адрес</th>
                  <th className="text-right px-3 py-2">Заблокировано</th>
                  <th className="text-left px-3 py-2">ID пользователя</th>
                </tr>
              </thead>
              <tbody>
                {d.stuckLockedFunds.map((s) => (
                  <tr key={s.userId} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <td className="px-3 py-2 font-mono" title={s.address}>{shortAddr(s.address)}</td>
                    <td className="px-3 py-2 text-right font-mono text-yellow-400">{formatLaunch(s.locked)}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)] text-[10px]">{s.userId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        </section>
      )}

      {/* Coin Flip Randomness (since server start) */}
      {d?.coinFlipStats && d.coinFlipStats.total > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Рандомность монетки (с запуска сервера)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Орёл" value={d.coinFlipStats.heads} sub={`${d.coinFlipStats.total > 0 ? ((d.coinFlipStats.heads / d.coinFlipStats.total) * 100).toFixed(1) : 0}%`} />
            <StatCard label="Решка" value={d.coinFlipStats.tails} sub={`${d.coinFlipStats.total > 0 ? ((d.coinFlipStats.tails / d.coinFlipStats.total) * 100).toFixed(1) : 0}%`} />
            <StatCard label="Всего бросков" value={d.coinFlipStats.total} sub="crypto.randomBytes" />
          </div>
        </section>
      )}

      {/* Pending Bet Secrets */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          Ожидающие секреты ({d?.pendingSecrets.count ?? '...'})
        </h2>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Секреты, сохранённые до бродкаста и ещё не использованные. Старые записи ({'>'}1ч) очищаются автоматически.
        </p>

        {pendingSecrets.data && pendingSecrets.data.length > 0 ? (
          <TableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  <th className="text-left px-3 py-2">Коммитмент</th>
                  <th className="text-left px-3 py-2">Сторона</th>
                  <th className="text-left px-3 py-2">Хэш TX</th>
                  <th className="text-left px-3 py-2">Возраст</th>
                </tr>
              </thead>
              <tbody>
                {pendingSecrets.data.map((s, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)]/50 last:border-0">
                    <td className="px-3 py-2 font-mono text-[10px]">{s.commitment}</td>
                    <td className="px-3 py-2">{s.makerSide}</td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">{s.txHash ? shortAddr(s.txHash) : '—'}</td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">{s.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-green-400">
            Нет ожидающих секретов — все ставки разрешены
          </div>
        )}
      </section>
    </div>
  );
}
