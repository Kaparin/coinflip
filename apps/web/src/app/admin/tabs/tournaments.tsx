'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus, Play, Square, Calculator, CheckCircle, Ban, Archive, Send, Loader2, Trophy } from 'lucide-react';
import { StatCard, StatusBadge, ActionButton, timeAgo } from '../_shared';
import { API_URL } from '@/lib/constants';
import { getAuthHeaders } from '@/lib/auth-headers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SCORING_TIERS } from '@coinflip/shared/constants';

interface TournamentRow {
  id: string;
  title: string;
  status: string;
  entryFee: string;
  prizePool: string;
  bonusPool: string;
  totalPrizePool: string;
  commissionBps: number;
  participantCount: number;
  teamCount: number;
  registrationStartsAt: string;
  registrationEndsAt: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? res.statusText);
  }
  return (await res.json()).data;
}

function formatAXM(micro: string): string {
  return (Number(micro) / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function TournamentsAdminTab() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: () => adminFetch<TournamentRow[]>('/api/v1/admin/tournaments'),
    staleTime: 10_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-tournaments'] });

  const doAction = async (id: string, action: string) => {
    setActionLoading(`${id}_${action}`);
    try {
      await adminFetch(`/api/v1/admin/tournaments/${id}/${action}`, { method: 'POST' });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  const list = tournaments ?? [];
  const active = list.filter((t) => ['registration', 'active'].includes(t.status));
  const others = list.filter((t) => !['registration', 'active'].includes(t.status));

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Всего турниров" value={list.length} />
        <StatCard label="Активные" value={active.length} />
        <StatCard label="Участники" value={list.reduce((s, t) => s + t.participantCount, 0)} />
        <StatCard label="Пул (AXM)" value={formatAXM(list.reduce((s, t) => s + Number(t.totalPrizePool), 0).toString() + '000000')} />
      </div>

      {/* Create button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Турниры</h3>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={14} />
          Создать турнир
        </button>
      </div>

      {/* Create form */}
      {creating && <CreateTournamentForm onClose={() => setCreating(false)} onCreated={refresh} />}

      {/* Tournament list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-[var(--color-surface)] animate-pulse" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <Trophy size={32} className="text-[var(--color-text-secondary)] mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">Нет турниров</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...active, ...others].map((t) => (
            <div key={t.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-[var(--color-text)] truncate">{t.title}</h4>
                  <p className="text-[10px] text-[var(--color-text-secondary)]">{timeAgo(t.createdAt)}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>

              <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-secondary)] mb-2">
                <span>{t.participantCount} участников</span>
                <span>{t.teamCount} команд</span>
                <span>Пул: {formatAXM(t.totalPrizePool)} AXM</span>
                <span>Взнос: {formatAXM(t.entryFee)} AXM</span>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-1.5">
                {t.status === 'draft' && (
                  <>
                    <ActionButton
                      onClick={() => doAction(t.id, 'open-registration')}
                      disabled={actionLoading === `${t.id}_open-registration`}
                    >
                      <Play size={12} className="inline mr-1" />
                      Открыть регистрацию
                    </ActionButton>
                    <ActionButton variant="danger" onClick={() => adminFetch(`/api/v1/admin/tournaments/${t.id}`, { method: 'DELETE' }).then(refresh)}>
                      Удалить
                    </ActionButton>
                  </>
                )}
                {t.status === 'registration' && (
                  <>
                    <ActionButton
                      onClick={() => doAction(t.id, 'start')}
                      disabled={actionLoading === `${t.id}_start`}
                      variant="success"
                    >
                      <Play size={12} className="inline mr-1" />
                      Старт турнира
                    </ActionButton>
                    <ActionButton variant="danger" onClick={() => doAction(t.id, 'cancel')}>
                      <Ban size={12} className="inline mr-1" />
                      Отмена
                    </ActionButton>
                  </>
                )}
                {t.status === 'active' && (
                  <>
                    <ActionButton
                      onClick={() => doAction(t.id, 'end')}
                      disabled={actionLoading === `${t.id}_end`}
                    >
                      <Square size={12} className="inline mr-1" />
                      Завершить
                    </ActionButton>
                    <ActionButton variant="danger" onClick={() => doAction(t.id, 'cancel')}>
                      <Ban size={12} className="inline mr-1" />
                      Отмена
                    </ActionButton>
                  </>
                )}
                {t.status === 'calculating' && (
                  <>
                    <ActionButton onClick={() => doAction(t.id, 'calculate')}>
                      <Calculator size={12} className="inline mr-1" />
                      Рассчитать
                    </ActionButton>
                    <ActionButton variant="success" onClick={() => doAction(t.id, 'approve')}>
                      <CheckCircle size={12} className="inline mr-1" />
                      Утвердить
                    </ActionButton>
                  </>
                )}
                {t.status === 'completed' && (
                  <>
                    <ActionButton variant="success" onClick={() => doAction(t.id, 'distribute')}>
                      <Send size={12} className="inline mr-1" />
                      Раздать призы
                    </ActionButton>
                    <ActionButton onClick={() => doAction(t.id, 'archive')}>
                      <Archive size={12} className="inline mr-1" />
                      Архив
                    </ActionButton>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Create Tournament Form ----

function CreateTournamentForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [entryFee, setEntryFee] = useState('10');
  const [commissionBps, setCommissionBps] = useState(500);
  const [bonusPool, setBonusPool] = useState('0');
  const [minTeamSize, setMinTeamSize] = useState(1);
  const [maxTeamSize, setMaxTeamSize] = useState(10);
  const [maxParticipants, setMaxParticipants] = useState('');

  // Scoring tiers
  const [scoringTiers, setScoringTiers] = useState<Array<{ minAmount: string; maxAmount: string; winPoints: number; lossPoints: number }>>(
    DEFAULT_SCORING_TIERS.map(t => ({ minAmount: String(Number(t.minAmount) / 1_000_000), maxAmount: String(Number(t.maxAmount) / 1_000_000), winPoints: t.winPoints, lossPoints: t.lossPoints })),
  );

  // Dates
  const [regStartDate, setRegStartDate] = useState('');
  const [regStartTime, setRegStartTime] = useState('12:00');
  const [regEndDate, setRegEndDate] = useState('');
  const [regEndTime, setRegEndTime] = useState('12:00');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('12:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('12:00');

  // Prize distribution
  const [prizes, setPrizes] = useState<Array<{ place: number; percent: number }>>([
    { place: 1, percent: 50 },
    { place: 2, percent: 30 },
    { place: 3, percent: 20 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPercent = prizes.reduce((s, p) => s + p.percent, 0);

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) { setError('Название обязательно'); return; }
    if (!regStartDate || !regEndDate || !startDate || !endDate) { setError('Все даты обязательны'); return; }
    if (totalPercent !== 100) { setError(`Сумма призов должна быть 100%, сейчас ${totalPercent}%`); return; }

    const entryFeeUaxm = (parseFloat(entryFee) * 1_000_000).toString();
    const bonusPoolUaxm = (parseFloat(bonusPool) * 1_000_000).toString();

    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      entryFee: entryFeeUaxm,
      commissionBps,
      bonusPool: bonusPoolUaxm,
      prizeDistribution: prizes,
      scoringConfig: { tiers: scoringTiers.map(t => ({
        minAmount: String(Math.round(Number(t.minAmount) * 1_000_000)),
        maxAmount: String(Math.round(Number(t.maxAmount) * 1_000_000)),
        winPoints: t.winPoints,
        lossPoints: t.lossPoints,
      })) },
      teamConfig: { minSize: minTeamSize, maxSize: maxTeamSize },
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
      registrationStartsAt: new Date(`${regStartDate}T${regStartTime}`).toISOString(),
      registrationEndsAt: new Date(`${regEndDate}T${regEndTime}`).toISOString(),
      startsAt: new Date(`${startDate}T${startTime}`).toISOString(),
      endsAt: new Date(`${endDate}T${endTime}`).toISOString(),
    };

    setLoading(true);
    try {
      await adminFetch('/api/v1/admin/tournaments/create-and-open', { method: 'POST', body: JSON.stringify(body) });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-surface)] p-4 space-y-3">
      <h4 className="text-sm font-bold">Создать турнир</h4>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Название</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Турнир #1"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-primary)]/50" />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Описание</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-primary)]/50 resize-none" />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Взнос (AXM)</label>
          <input type="number" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} min="0" step="1"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Комиссия (BPS)</label>
          <input type="number" value={commissionBps} onChange={(e) => setCommissionBps(Number(e.target.value))} min="0" max="2000" step="100"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Бонус пул (AXM)</label>
          <input type="number" value={bonusPool} onChange={(e) => setBonusPool(e.target.value)} min="0"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Макс. участников</label>
          <input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="∞"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Мин. команда</label>
          <input type="number" value={minTeamSize} onChange={(e) => setMinTeamSize(Number(e.target.value))} min="1" max="50"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Макс. команда</label>
          <input type="number" value={maxTeamSize} onChange={(e) => setMaxTeamSize(Number(e.target.value))} min="1" max="50"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none" />
        </div>
      </div>

      {/* Duration presets */}
      <div>
        <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Быстрая настройка дат</label>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: '1 день', regHours: 12, durHours: 24 },
            { label: '3 дня', regHours: 24, durHours: 72 },
            { label: '7 дней', regHours: 48, durHours: 168 },
            { label: '14 дней', regHours: 72, durHours: 336 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                const now = new Date();
                const regStart = new Date(now.getTime() + 5 * 60_000); // +5min
                const regEnd = new Date(regStart.getTime() + preset.regHours * 3600_000);
                const start = new Date(regEnd.getTime() + 3600_000); // +1h after reg ends
                const end = new Date(start.getTime() + preset.durHours * 3600_000);
                const fmt = (d: Date) => d.toISOString().slice(0, 10);
                const fmtTime = (d: Date) => d.toTimeString().slice(0, 5);
                setRegStartDate(fmt(regStart)); setRegStartTime(fmtTime(regStart));
                setRegEndDate(fmt(regEnd)); setRegEndTime(fmtTime(regEnd));
                setStartDate(fmt(start)); setStartTime(fmtTime(start));
                setEndDate(fmt(end)); setEndTime(fmtTime(end));
              }}
              className="px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-[10px] hover:bg-[var(--color-border)]/30 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Рег. начало</label>
          <div className="flex gap-1">
            <input type="date" value={regStartDate} onChange={(e) => setRegStartDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
            <input type="time" value={regStartTime} onChange={(e) => setRegStartTime(e.target.value)}
              className="w-20 px-2 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Рег. конец</label>
          <div className="flex gap-1">
            <input type="date" value={regEndDate} onChange={(e) => setRegEndDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
            <input type="time" value={regEndTime} onChange={(e) => setRegEndTime(e.target.value)}
              className="w-20 px-2 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Старт турнира</label>
          <div className="flex gap-1">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="w-20 px-2 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase mb-1 block">Конец турнира</label>
          <div className="flex gap-1">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="w-20 px-2 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Scoring Tiers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase">Тиры очков</label>
          <button
            onClick={() => setScoringTiers([...scoringTiers, { minAmount: '0', maxAmount: '0', winPoints: 3, lossPoints: 1 }])}
            className="text-[10px] text-[var(--color-primary)]"
          >
            + Добавить тир
          </button>
        </div>
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_1fr_60px_60px_24px] gap-1 text-[9px] text-[var(--color-text-secondary)] uppercase px-1">
            <span>От (AXM)</span><span>До (AXM)</span><span>Win</span><span>Loss</span><span></span>
          </div>
          {scoringTiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_60px_60px_24px] gap-1">
              <input type="number" value={tier.minAmount} onChange={(e) => { const u = [...scoringTiers]; u[i] = { ...tier, minAmount: e.target.value }; setScoringTiers(u); }}
                className="px-2 py-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
              <input type="number" value={tier.maxAmount} onChange={(e) => { const u = [...scoringTiers]; u[i] = { ...tier, maxAmount: e.target.value }; setScoringTiers(u); }}
                className="px-2 py-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" />
              <input type="number" value={tier.winPoints} onChange={(e) => { const u = [...scoringTiers]; u[i] = { ...tier, winPoints: Number(e.target.value) }; setScoringTiers(u); }}
                className="px-2 py-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" min="0" />
              <input type="number" value={tier.lossPoints} onChange={(e) => { const u = [...scoringTiers]; u[i] = { ...tier, lossPoints: Number(e.target.value) }; setScoringTiers(u); }}
                className="px-2 py-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none" min="0" />
              {scoringTiers.length > 1 && (
                <button onClick={() => setScoringTiers(scoringTiers.filter((_, j) => j !== i))} className="text-red-400 text-sm self-center">×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Prizes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-[var(--color-text-secondary)] uppercase">Призы ({totalPercent}%)</label>
          <button
            onClick={() => setPrizes([...prizes, { place: prizes.length + 1, percent: 0 }])}
            className="text-[10px] text-[var(--color-primary)]"
          >
            + Добавить место
          </button>
        </div>
        <div className="space-y-1">
          {prizes.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)] w-16">{p.place} место:</span>
              <input
                type="number"
                value={p.percent}
                onChange={(e) => {
                  const updated = [...prizes];
                  updated[i] = { ...p, percent: Number(e.target.value) };
                  setPrizes(updated);
                }}
                min="0" max="100"
                className="w-20 px-2 py-1 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-xs focus:outline-none"
              />
              <span className="text-xs text-[var(--color-text-secondary)]">%</span>
              {prizes.length > 1 && (
                <button onClick={() => setPrizes(prizes.filter((_, j) => j !== i))} className="text-[10px] text-red-400">×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-[var(--color-bg)] text-[var(--color-text-secondary)]">
          Отмена
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-[var(--color-primary)] text-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Создать и открыть регистрацию'}
        </button>
      </div>
    </div>
  );
}
