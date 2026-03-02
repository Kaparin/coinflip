'use client';

import { useState } from 'react';
import { PieChart, Plus, Trash2, Loader2 } from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';
import {
  useAdminCommissionBreakdown,
  useAdminPartners,
  useAdminAddPartner,
  useAdminUpdatePartner,
  useAdminDeletePartner,
  useAdminConfig,
  useAdminUpdateConfig,
  type AdminPartner,
} from '@/hooks/use-admin';
import { StatCard, TableWrapper, ActionButton, shortAddr, timeAgo } from '../_shared';

export function CommissionTab() {
  const { data: breakdown, isLoading: breakdownLoading } = useAdminCommissionBreakdown();
  const { data: partners, isLoading: partnersLoading } = useAdminPartners();
  const { data: allConfig } = useAdminConfig();
  const updateConfig = useAdminUpdateConfig();

  const [showAddForm, setShowAddForm] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  // Editable referral BPS
  const [editingReferral, setEditingReferral] = useState(false);
  const [refL1, setRefL1] = useState('');
  const [refL2, setRefL2] = useState('');
  const [refL3, setRefL3] = useState('');
  const [refMax, setRefMax] = useState('');

  const isLoading = breakdownLoading || partnersLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  const bd = breakdown?.breakdown;

  const startEditReferral = () => {
    if (!allConfig) return;
    const get = (k: string, d: string) => allConfig.find((c) => c.key === k)?.value ?? d;
    setRefL1(get('REFERRAL_BPS_LEVEL_1', '300'));
    setRefL2(get('REFERRAL_BPS_LEVEL_2', '150'));
    setRefL3(get('REFERRAL_BPS_LEVEL_3', '50'));
    setRefMax(get('MAX_REFERRAL_BPS_PER_BET', '500'));
    setEditingReferral(true);
  };

  const saveReferral = async () => {
    setActionResult(null);
    try {
      for (const [key, val] of [
        ['REFERRAL_BPS_LEVEL_1', refL1],
        ['REFERRAL_BPS_LEVEL_2', refL2],
        ['REFERRAL_BPS_LEVEL_3', refL3],
        ['MAX_REFERRAL_BPS_PER_BET', refMax],
      ] as const) {
        await updateConfig.mutateAsync({ key, value: val });
      }
      setEditingReferral(false);
      setActionResult('Реферальный конфиг сохранён');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setActionResult(`Error: ${message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Commission Breakdown */}
      {bd && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <PieChart size={16} className="text-[var(--color-primary)]" />
            Распределение комиссии ({bd.commissionBps / 100}% от банка)
          </h3>

          {/* Visual bar */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <div className="flex h-6 overflow-hidden rounded-full">
              {bd.referralMaxBps > 0 && (
                <div
                  className="bg-blue-500 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ width: `${(bd.referralMaxBps / bd.commissionBps) * 100}%` }}
                >
                  Реф {bd.referralMaxBps / 100}%
                </div>
              )}
              {bd.jackpotBps > 0 && (
                <div
                  className="bg-purple-500 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ width: `${(bd.jackpotBps / bd.commissionBps) * 100}%` }}
                >
                  ДП {bd.jackpotBps / 100}%
                </div>
              )}
              {bd.partnerBps > 0 && (
                <div
                  className="bg-teal-500 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ width: `${(bd.partnerBps / bd.commissionBps) * 100}%` }}
                >
                  Партнёры {bd.partnerBps / 100}%
                </div>
              )}
              {bd.treasuryBps > 0 && (
                <div
                  className="bg-amber-500 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ width: `${(bd.treasuryBps / bd.commissionBps) * 100}%` }}
                >
                  Казна {bd.treasuryBps / 100}%
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Рефералы (макс)" value={`${bd.referralMaxBps} BPS`} sub={`${bd.referralMaxBps / 100}% от банка`} />
              <StatCard label="Джекпот" value={`${bd.jackpotBps} BPS`} sub={`${bd.jackpotBps / 100}% от банка`} />
              <StatCard label="Партнёры" value={`${bd.partnerBps} BPS`} sub={`${bd.partnerBps / 100}% от банка`} />
              <StatCard label="Казна" value={`${bd.treasuryBps} BPS`} sub={`${bd.treasuryBps / 100}% от банка`} />
            </div>

            {!breakdown?.valid && breakdown?.error && (
              <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {breakdown.error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {actionResult && (
        <div className={`rounded-lg px-4 py-2 text-xs ${actionResult.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {actionResult}
        </div>
      )}

      {/* Referral Config */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Уровни рефералов</h3>
          {!editingReferral ? (
            <ActionButton onClick={startEditReferral}>Изменить</ActionButton>
          ) : (
            <div className="flex gap-2">
              <ActionButton onClick={() => setEditingReferral(false)} variant="danger">Отмена</ActionButton>
              <ActionButton onClick={saveReferral} variant="success" disabled={updateConfig.isPending}>Сохранить</ActionButton>
            </div>
          )}
        </div>

        {editingReferral ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Уровень 1 BPS</label>
              <input type="number" value={refL1} onChange={(e) => setRefL1(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Уровень 2 BPS</label>
              <input type="number" value={refL2} onChange={(e) => setRefL2(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Уровень 3 BPS</label>
              <input type="number" value={refL3} onChange={(e) => setRefL3(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Макс. кап BPS</label>
              <input type="number" value={refMax} onChange={(e) => setRefMax(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {bd && (
              <>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Уровень 1</p>
                  <p className="text-sm font-bold">{allConfig?.find((c) => c.key === 'REFERRAL_BPS_LEVEL_1')?.value ?? '300'} BPS</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Уровень 2</p>
                  <p className="text-sm font-bold">{allConfig?.find((c) => c.key === 'REFERRAL_BPS_LEVEL_2')?.value ?? '150'} BPS</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Уровень 3</p>
                  <p className="text-sm font-bold">{allConfig?.find((c) => c.key === 'REFERRAL_BPS_LEVEL_3')?.value ?? '50'} BPS</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
                  <p className="text-[10px] text-[var(--color-text-secondary)]">Макс. кап</p>
                  <p className="text-sm font-bold">{allConfig?.find((c) => c.key === 'MAX_REFERRAL_BPS_PER_BET')?.value ?? '500'} BPS</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Partners */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Партнёрская казна</h3>
          <ActionButton onClick={() => setShowAddForm(!showAddForm)}>
            <span className="flex items-center gap-1">
              <Plus size={12} />
              Добавить
            </span>
          </ActionButton>
        </div>

        {showAddForm && (
          <AddPartnerForm
            onSuccess={() => { setShowAddForm(false); setActionResult('Партнёр добавлен'); }}
            onError={(msg) => setActionResult(`Ошибка: ${msg}`)}
          />
        )}

        {partners && partners.length > 0 ? (
          <TableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Имя</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Адрес</th>
                  <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">BPS</th>
                  <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">Статус</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Заработано</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Действия</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <PartnerRow
                    key={p.id}
                    partner={p}
                    onResult={setActionResult}
                  />
                ))}
              </tbody>
            </table>
          </TableWrapper>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
            <p className="text-xs text-[var(--color-text-secondary)]">Партнёры не настроены</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddPartnerForm({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const addPartner = useAdminAddPartner();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [bps, setBps] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !address.trim() || !bps) return;
    try {
      await addPartner.mutateAsync({ name: name.trim(), address: address.trim(), bps: Number(bps) });
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      onError(message);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Имя</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Имя партнёра"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">Адрес кошелька</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
            placeholder="axm1..."
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-mono focus:border-[var(--color-primary)] focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-text-secondary)] mb-1">BPS (basis points)</label>
          <input type="number" value={bps} onChange={(e) => setBps(e.target.value)}
            placeholder="100"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs focus:border-[var(--color-primary)] focus:outline-none" />
        </div>
      </div>
      <ActionButton onClick={handleSubmit} variant="success" disabled={addPartner.isPending || !name.trim() || !address.trim()}>
        {addPartner.isPending ? 'Добавление...' : 'Добавить партнёра'}
      </ActionButton>
    </div>
  );
}

function PartnerRow({ partner, onResult }: { partner: AdminPartner; onResult: (msg: string) => void }) {
  const updatePartner = useAdminUpdatePartner();
  const deletePartner = useAdminDeletePartner();
  const [editBps, setEditBps] = useState(String(partner.bps));
  const [editing, setEditing] = useState(false);

  const handleSave = async () => {
    try {
      await updatePartner.mutateAsync({ id: partner.id, bps: Number(editBps) });
      setEditing(false);
      onResult('Партнёр обновлён');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      onResult(`Error: ${message}`);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePartner.mutateAsync(partner.id);
      onResult('Партнёр деактивирован');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      onResult(`Error: ${message}`);
    }
  };

  return (
    <tr className="border-b border-[var(--color-border)] last:border-0">
      <td className="px-3 py-2 font-medium">{partner.name}</td>
      <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">{shortAddr(partner.address)}</td>
      <td className="px-3 py-2 text-center">
        {editing ? (
          <input type="number" value={editBps} onChange={(e) => setEditBps(e.target.value)}
            className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-xs text-center" />
        ) : (
          <span className="tabular-nums">{partner.bps}</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
          partner.isActive === 1 ? 'bg-green-500/15 text-green-400' : 'bg-gray-500/15 text-gray-400'
        }`}>
          {partner.isActive === 1 ? 'Активен' : 'Неактивен'}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatLaunch(partner.totalEarned)}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <ActionButton onClick={() => setEditing(false)} variant="danger">Отмена</ActionButton>
              <ActionButton onClick={handleSave} variant="success" disabled={updatePartner.isPending}>Сохранить</ActionButton>
            </>
          ) : (
            <>
              <ActionButton onClick={() => setEditing(true)}>Изменить</ActionButton>
              {partner.isActive === 1 && (
                <ActionButton onClick={handleDelete} variant="danger" disabled={deletePartner.isPending}>
                  <Trash2 size={12} />
                </ActionButton>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
