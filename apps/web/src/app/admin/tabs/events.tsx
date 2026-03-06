'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { formatLaunch, toMicroLaunch } from '@coinflip/shared/constants';
import { Trophy, Target, Plus, Play, Calculator, CheckCircle, Archive, Trash2, Clock, Gift, Minus, Eye, Send, XCircle, Ban, Pencil, RotateCcw, User } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

import { useAdminPendingSponsoredRaffles, useAdminApproveSponsoredRaffle, useAdminRejectSponsoredRaffle } from '@/hooks/use-admin';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function getAuthHeaders(): Record<string, string> {
  const addr = typeof window !== 'undefined'
    ? sessionStorage.getItem('coinflip_connected_address')
    : null;
  return addr ? { 'x-wallet-address': addr } : {};
}

interface EventRow {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  status: string;
  startsAt: string;
  endsAt: string;
  totalPrizePool: string;
  participantCount: number;
  config?: Record<string, unknown>;
  prizes?: PrizeRow[];
}

interface PrizeRow {
  place: number;
  amount: string;
}

interface WinnerRow {
  userId: string;
  address: string;
  prizeAmount: string | null;
  prizeTxHash: string | null;
  finalRank: number | null;
}

const DURATION_PRESETS = [
  { label: '1 час', hours: 1 },
  { label: '24 часа', hours: 24 },
  { label: '3 дня', hours: 72 },
  { label: '7 дней', hours: 168 },
] as const;

const PRIZE_PRESETS = [
  { label: 'Топ 3 (50/30/20%)', distribution: [50, 30, 20] },
  { label: 'Топ 5 (40/25/15/12/8%)', distribution: [40, 25, 15, 12, 8] },
] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toLocalTimeStr = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none transition-colors';
const labelCls = 'text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-1 block';

const shortAddr = (addr: string) =>
  addr.length > 15 ? `${addr.slice(0, 10)}...${addr.slice(-4)}` : addr;

function PendingSponsoredRaffles({ onRefreshEvents }: { onRefreshEvents: () => void }) {
  const { data: pending, isLoading } = useAdminPendingSponsoredRaffles();
  const approveMut = useAdminApproveSponsoredRaffle();
  const rejectMut = useAdminRejectSponsoredRaffle();
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  if (isLoading || !pending || pending.length === 0) return null;

  const handleApprove = async (eventId: string) => {
    if (!window.confirm('Одобрить спонсорский розыгрыш? Он будет активирован (или запланирован).')) return;
    await approveMut.mutateAsync(eventId);
    onRefreshEvents();
  };

  const handleReject = async (eventId: string) => {
    await rejectMut.mutateAsync({ eventId, reason: rejectReason || undefined });
    setRejectingId(null);
    setRejectReason('');
    onRefreshEvents();
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Trophy size={14} className="text-amber-400" />
        <span className="text-xs font-bold text-amber-400">Спонсорские розыгрыши на проверке ({pending.length})</span>
      </div>
      {pending.map((r) => (
        <div key={r.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">{r.title}</div>
              {r.description && <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{r.description}</div>}
              <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] text-[var(--color-text-secondary)]">
                <span>{fmtDate(r.startsAt)} — {fmtDate(r.endsAt)}</span>
                <span className="font-bold text-[var(--color-success)]">Приз: {formatLaunch(r.totalPrizePool)} COIN (виртуальный)</span>
                {r.pricePaid && <span>Оплата: {formatLaunch(r.pricePaid)} COIN</span>}
              </div>
              {(r.sponsorNickname || r.sponsorAddress) && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-[var(--color-text-secondary)]">
                  <User size={10} />
                  <span>Спонсор: {r.sponsorNickname || shortAddr(r.sponsorAddress ?? '')}</span>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => handleApprove(r.id)}
                disabled={approveMut.isPending}
                className="rounded-lg bg-[var(--color-success)] px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-40"
              >
                {approveMut.isPending ? '...' : 'Одобрить'}
              </button>
              <button
                type="button"
                onClick={() => setRejectingId(rejectingId === r.id ? null : r.id)}
                disabled={rejectMut.isPending}
                className="rounded-lg bg-[var(--color-danger)] px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-40"
              >
                Отклонить
              </button>
            </div>
          </div>
          {rejectingId === r.id && (
            <div className="flex items-center gap-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Причина отказа (необязательно)"
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleReject(r.id)}
                disabled={rejectMut.isPending}
                className="rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
              >
                {rejectMut.isPending ? '...' : 'Подтвердить отказ'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function EventsTab() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Detail modal state
  const [detailEvent, setDetailEvent] = useState<EventRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [winnersLoading, setWinnersLoading] = useState(false);
  const [distLoading, setDistLoading] = useState<string | null>(null);

  // Form state
  const [formType, setFormType] = useState<'contest' | 'raffle'>('contest');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formMetric, setFormMetric] = useState<'turnover' | 'wins' | 'profit'>('turnover');
  const [formAutoJoin, setFormAutoJoin] = useState(true);
  const [formPrizePool, setFormPrizePool] = useState('');
  const [prizes, setPrizes] = useState<PrizeRow[]>([
    { place: 1, amount: '500' },
    { place: 2, amount: '300' },
    { place: 3, amount: '200' },
  ]);
  const [formMaxParticipants, setFormMaxParticipants] = useState('');
  const [formTouched, setFormTouched] = useState(false);

  // Edit mode state for detail modal
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Track editing event ID for create modal reuse
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // --- Data fetching ---

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter
        ? `${API_BASE}/api/v1/admin/events?status=${statusFilter}`
        : `${API_BASE}/api/v1/admin/events`;
      const res = await fetch(url, { credentials: 'include', headers: { ...getAuthHeaders() } });
      if (res.ok) {
        const json = await res.json();
        setEvents(json.data ?? []);
      }
    } catch {
      setMessage('Не удалось загрузить ивенты');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // --- Detail modal ---

  const fetchWinners = useCallback(async (eventId: string) => {
    setWinnersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/events/${eventId}/distribution-status`, {
        credentials: 'include',
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const json = await res.json();
        setWinners(
          (json.data?.winners ?? []).map((w: { userId: string; address: string; amount: string; rank: number; txHash: string | null }) => ({
            userId: w.userId,
            address: w.address,
            prizeAmount: w.amount,
            prizeTxHash: w.txHash,
            finalRank: w.rank,
          })),
        );
      }
    } catch {
      setMessage('Не удалось загрузить победителей');
    } finally {
      setWinnersLoading(false);
    }
  }, []);

  const openDetail = useCallback(
    (event: EventRow) => {
      setDetailEvent(event);
      setDetailOpen(true);
      setWinners([]);
      if (event.status === 'completed' || event.status === 'calculating') {
        fetchWinners(event.id);
      }
    },
    [fetchWinners],
  );

  const handleDistributeAll = async () => {
    if (!detailEvent) return;
    setDistLoading('all');
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/events/${detailEvent.id}/distribute`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const json = await res.json();
        setMessage(json.data?.message ?? 'Призы розданы!');
        fetchWinners(detailEvent.id);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Ошибка: ${err?.error?.message ?? 'Неизвестная ошибка'}`);
      }
    } catch {
      setMessage('Не удалось раздать призы');
    } finally {
      setDistLoading(null);
    }
  };

  const handleDistributeOne = async (userId: string) => {
    if (!detailEvent) return;
    setDistLoading(userId);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/admin/events/${detailEvent.id}/distribute/${userId}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { ...getAuthHeaders() },
        },
      );
      if (res.ok) {
        setMessage('Приз отправлен!');
        fetchWinners(detailEvent.id);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Ошибка: ${err?.error?.message ?? 'Неизвестная ошибка'}`);
      }
    } catch {
      setMessage('Не удалось раздать призы');
    } finally {
      setDistLoading(null);
    }
  };

  // --- Computed values ---

  const prizesTotal = useMemo(
    () => prizes.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [prizes],
  );

  const formErrors = useMemo(() => {
    const errors: string[] = [];
    if (!formTitle.trim()) errors.push('Название обязательно');
    if (!formStartDate || !formStartTime) errors.push('Укажите дату/время начала');
    if (!formEndDate || !formEndTime) errors.push('Укажите дату/время окончания');
    if (formStartDate && formStartTime) {
      const start = new Date(`${formStartDate}T${formStartTime}`);
      if (start < new Date()) errors.push('Дата начала в прошлом');
    }
    if (formStartDate && formStartTime && formEndDate && formEndTime) {
      const start = new Date(`${formStartDate}T${formStartTime}`);
      const end = new Date(`${formEndDate}T${formEndTime}`);
      if (end <= start) errors.push('Конец должен быть после начала');
    }
    const pool = Number(formPrizePool);
    if (!pool || pool <= 0) errors.push('Призовой фонд обязателен');
    if (prizes.length === 0) errors.push('Нужен хотя бы один приз');
    if (prizes.some((p) => !p.amount || Number(p.amount) <= 0)) errors.push('У всех призов должны быть суммы');
    if (pool > 0 && prizesTotal > 0 && prizesTotal !== pool) {
      errors.push(`Сумма призов (${prizesTotal}) \u2260 фонд (${pool})`);
    }
    return errors;
  }, [formTitle, formStartDate, formStartTime, formEndDate, formEndTime, formPrizePool, prizes, prizesTotal]);

  const isFormValid = formErrors.length === 0;

  const dateRangePreview = useMemo(() => {
    if (!formStartDate || !formStartTime || !formEndDate || !formEndTime) return null;
    try {
      const start = new Date(`${formStartDate}T${formStartTime}`);
      const end = new Date(`${formEndDate}T${formEndTime}`);
      const fmt = (d: Date) =>
        d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) +
        ' ' +
        d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return `${fmt(start)} \u2014 ${fmt(end)}`;
    } catch {
      return null;
    }
  }, [formStartDate, formStartTime, formEndDate, formEndTime]);

  const distributedCount = useMemo(() => winners.filter((w) => w.prizeTxHash).length, [winners]);

  // --- Form actions ---

  const applyDurationPreset = useCallback((hours: number) => {
    const now = new Date();
    const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
    setFormStartDate(toLocalDateStr(now));
    setFormStartTime(toLocalTimeStr(now));
    setFormEndDate(toLocalDateStr(end));
    setFormEndTime(toLocalTimeStr(end));
  }, []);

  const applyPrizePreset = useCallback(
    (distribution: readonly number[]) => {
      const pool = Number(formPrizePool);
      if (pool <= 0) return;
      setPrizes(
        distribution.map((pct, i) => ({
          place: i + 1,
          amount: String(Math.round((pool * pct) / 100)),
        })),
      );
    },
    [formPrizePool],
  );

  const addPrize = useCallback(() => {
    setPrizes((prev) => [...prev, { place: prev.length + 1, amount: '' }]);
  }, []);

  const removePrize = useCallback((index: number) => {
    setPrizes((prev) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, place: i + 1 })));
  }, []);

  const updatePrizeAmount = useCallback((index: number, amount: string) => {
    setPrizes((prev) => prev.map((p, i) => (i === index ? { ...p, amount } : p)));
  }, []);

  const resetForm = useCallback(() => {
    setFormType('contest');
    setFormTitle('');
    setFormDesc('');
    setFormStartDate('');
    setFormStartTime('');
    setFormEndDate('');
    setFormEndTime('');
    setFormMetric('turnover');
    setFormAutoJoin(true);
    setFormPrizePool('');
    setPrizes([
      { place: 1, amount: '500' },
      { place: 2, amount: '300' },
      { place: 3, amount: '200' },
    ]);
    setFormMaxParticipants('');
    setFormTouched(false);
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setEditingEventId(null);
    setModalOpen(true);
  }, [resetForm]);

  const openEditDraftModal = useCallback((event: EventRow) => {
    // Prefill form with event data for draft editing
    setEditingEventId(event.id);
    setFormType(event.type as 'contest' | 'raffle');
    setFormTitle(event.title);
    setFormDesc(event.description ?? '');
    const startD = new Date(event.startsAt);
    const endD = new Date(event.endsAt);
    setFormStartDate(toLocalDateStr(startD));
    setFormStartTime(toLocalTimeStr(startD));
    setFormEndDate(toLocalDateStr(endD));
    setFormEndTime(toLocalTimeStr(endD));
    if (event.config?.metric) setFormMetric(event.config.metric as 'turnover' | 'wins' | 'profit');
    if (event.config?.autoJoin !== undefined) setFormAutoJoin(Boolean(event.config.autoJoin));
    if (event.config?.maxParticipants) setFormMaxParticipants(String(event.config.maxParticipants));
    // Convert micro-LAUNCH back to LAUNCH for display
    const poolInLaunch = Number(BigInt(event.totalPrizePool) / BigInt(1_000_000));
    setFormPrizePool(String(poolInLaunch));
    if (event.prizes && event.prizes.length > 0) {
      setPrizes(event.prizes.map((p) => ({
        place: p.place,
        amount: String(Number(BigInt(p.amount) / BigInt(1_000_000))),
      })));
    }
    setFormTouched(false);
    setModalOpen(true);
  }, []);

  const startEditMode = useCallback((event: EventRow) => {
    setEditMode(true);
    setEditTitle(event.title);
    setEditDesc(event.description ?? '');
    const endD = new Date(event.endsAt);
    setEditEndDate(toLocalDateStr(endD));
    setEditEndTime(toLocalTimeStr(endD));
  }, []);

  // --- API handlers ---

  const buildEventBody = () => {
    const prizesList = prizes.map((p) => ({
      place: p.place,
      amount: toMicroLaunch(Number(p.amount)),
      label: `#${p.place}`,
    }));

    const config: Record<string, unknown> = {};
    if (formType === 'contest') {
      config.metric = formMetric;
      config.autoJoin = formAutoJoin;
    }
    if (formType === 'raffle' && formMaxParticipants) {
      config.maxParticipants = Number(formMaxParticipants);
    }

    const startsAt = new Date(`${formStartDate}T${formStartTime}`).toISOString();
    const endsAt = new Date(`${formEndDate}T${formEndTime}`).toISOString();

    return {
      type: formType,
      title: formTitle,
      description: formDesc || undefined,
      startsAt,
      endsAt,
      config,
      prizes: prizesList,
      totalPrizePool: toMicroLaunch(Number(formPrizePool)),
    };
  };

  const handleCreate = async (activate = false) => {
    setFormTouched(true);
    if (!isFormValid) return;

    const loadingKey = activate ? 'create-activate' : 'create';
    setActionLoading(loadingKey);
    setMessage(null);
    try {
      const endpoint = activate
        ? `${API_BASE}/api/v1/admin/events/create-and-activate`
        : `${API_BASE}/api/v1/admin/events`;

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(buildEventBody()),
      });

      if (res.ok) {
        setMessage(activate ? 'Ивент создан и активирован!' : 'Ивент создан!');
        setModalOpen(false);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Ошибка: ${err?.error?.message ?? 'Неизвестная ошибка'}`);
      }
    } catch {
      setMessage('Не удалось создать ивент');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateEvent = async (eventId: string) => {
    setActionLoading('update');
    setMessage(null);
    try {
      const body: Record<string, unknown> = {};
      if (editingEventId) {
        // Full update for draft via create modal reuse
        body.title = formTitle;
        body.description = formDesc || undefined;
        body.startsAt = new Date(`${formStartDate}T${formStartTime}`).toISOString();
        body.endsAt = new Date(`${formEndDate}T${formEndTime}`).toISOString();
        const config: Record<string, unknown> = {};
        if (formType === 'contest') {
          config.metric = formMetric;
          config.autoJoin = formAutoJoin;
        }
        if (formType === 'raffle' && formMaxParticipants) {
          config.maxParticipants = Number(formMaxParticipants);
        }
        body.config = config;
        body.prizes = prizes.map((p) => ({
          place: p.place,
          amount: toMicroLaunch(Number(p.amount)),
          label: `#${p.place}`,
        }));
        body.totalPrizePool = toMicroLaunch(Number(formPrizePool));
      } else {
        // Inline edit for active events (limited fields)
        if (editTitle) body.title = editTitle;
        if (editDesc !== undefined) body.description = editDesc;
        if (editEndDate && editEndTime) {
          body.endsAt = new Date(`${editEndDate}T${editEndTime}`).toISOString();
        }
      }

      const res = await fetch(`${API_BASE}/api/v1/admin/events/${eventId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage('Ивент обновлён!');
        setEditMode(false);
        setEditingEventId(null);
        setModalOpen(false);
        setDetailOpen(false);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Ошибка: ${err?.error?.message ?? 'Неизвестная ошибка'}`);
      }
    } catch {
      setMessage('Не удалось обновить ивент');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (eventId: string, action: string, opts?: { force?: boolean }) => {
    // Confirmations for destructive actions
    if (action === 'delete' && !window.confirm('Удалить черновик ивента? Это нельзя отменить.')) return;
    if (action === 'cancel' && !window.confirm('Отменить ивент и удалить всех участников? Это нельзя отменить.')) return;
    if (action === 'activate' && !window.confirm('Активировать ивент? Он станет виден всем пользователям.')) return;
    if (action === 'approve' && !window.confirm('Подтвердить результаты и завершить? Победители будут зафиксированы.')) return;
    if (opts?.force && !window.confirm('Пересчитать принудительно? Предыдущие результаты будут сброшены.')) return;

    setActionLoading(`${action}:${eventId}`);
    setMessage(null);
    try {
      const method = action === 'delete' ? 'DELETE' : 'POST';
      // delete uses base path (DELETE /admin/events/:id), others use action subpath
      let url = action === 'delete'
        ? `${API_BASE}/api/v1/admin/events/${eventId}`
        : `${API_BASE}/api/v1/admin/events/${eventId}/${action}`;

      // Add force query param for calculate
      if (action === 'calculate' && opts?.force) {
        url += '?force=true';
      }

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const actionLabels: Record<string, string> = {
          activate: 'Ивент активирован!',
          cancel: 'Ивент отменён!',
          delete: 'Ивент удалён!',
          calculate: 'Результаты подсчитаны!',
          approve: 'Результаты подтверждены!',
          archive: 'Ивент архивирован!',
          distribute: 'Призы розданы!',
        };
        setMessage(actionLabels[action] ?? `${action} выполнено!`);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Ошибка: ${err?.error?.message ?? 'Неизвестная ошибка'}`);
      }
    } catch {
      setMessage(`Не удалось: ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  // --- Helpers ---

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const formatConfig = (event: EventRow) => {
    if (!event.config) return null;
    const parts: string[] = [];
    if (event.config.metric) parts.push(`метрика: ${event.config.metric}`);
    if (event.config.autoJoin) parts.push('авто-вступление');
    if (event.config.maxParticipants) parts.push(`макс: ${event.config.maxParticipants}`);
    return parts.length > 0 ? parts.join(' \u00b7 ') : null;
  };

  // --- Render ---

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            message.startsWith('Ошибка') || message.startsWith('Не удалось')
              ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
              : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
          }`}
        >
          {message}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
          >
            <option value="">Все статусы</option>
            <option value="draft">Черновик</option>
            <option value="active">Активен</option>
            <option value="calculating">Подсчёт</option>
            <option value="completed">Завершён</option>
            <option value="archived">Архив</option>
          </select>
          <button
            type="button"
            onClick={fetchEvents}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface)]"
          >
            Обновить
          </button>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)]"
        >
          <Plus size={14} />
          Создать ивент
        </button>
      </div>

      {/* Pending Sponsored Raffles */}
      <PendingSponsoredRaffles onRefreshEvents={fetchEvents} />

      {/* Create Event Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingEventId(null); }} title={editingEventId ? 'Изменить ивент' : 'Создать ивент'} closeOnOverlayClick={false}>
        <div className="space-y-4">
          {/* Type & Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Тип</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'contest' | 'raffle')}
                className={inputCls}
              >
                <option value="contest">Контест</option>
                <option value="raffle">Розыгрыш</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Название</label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className={`${inputCls} ${formTouched && !formTitle.trim() ? 'border-[var(--color-danger)]!' : ''}`}
                placeholder="Название ивента..."
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Описание</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="Описание (необязательно)..."
            />
          </div>

          {/* Duration presets */}
          <div>
            <label className={labelCls}>Длительность</label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyDurationPreset(preset.hours)}
                  className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors"
                >
                  <Clock size={10} />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date / Time inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Дата начала</label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Время начала</label>
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Дата окончания</label>
              <input
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Время окончания</label>
              <input
                type="time"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Date range preview */}
          {dateRangePreview && (
            <div className="rounded-lg bg-[var(--color-primary)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-primary)]">
              {dateRangePreview}
            </div>
          )}

          {/* Contest config */}
          {formType === 'contest' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Метрика</label>
                <select
                  value={formMetric}
                  onChange={(e) => setFormMetric(e.target.value as 'turnover' | 'wins' | 'profit')}
                  className={inputCls}
                >
                  <option value="turnover">Оборот</option>
                  <option value="wins">Победы</option>
                  <option value="profit">Профит</option>
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAutoJoin}
                    onChange={(e) => setFormAutoJoin(e.target.checked)}
                    className="rounded"
                  />
                  Авто-вступление (все игроки)
                </label>
              </div>
            </div>
          )}

          {/* Raffle config */}
          {formType === 'raffle' && (
            <div>
              <label className={labelCls}>Макс. участников (необязательно)</label>
              <input
                value={formMaxParticipants}
                onChange={(e) => setFormMaxParticipants(e.target.value)}
                className={inputCls}
                placeholder="Без ограничений"
                type="number"
                min="1"
              />
            </div>
          )}

          {/* Prize Pool */}
          <div>
            <label className={labelCls}>Призовой фонд (AXM)</label>
            <input
              value={formPrizePool}
              onChange={(e) => setFormPrizePool(e.target.value)}
              className={`${inputCls} ${formTouched && (!formPrizePool || Number(formPrizePool) <= 0) ? 'border-[var(--color-danger)]!' : ''}`}
              placeholder="1000"
              type="number"
              min="1"
            />
          </div>

          {/* Prize presets */}
          <div>
            <label className={labelCls}>Шаблоны распределения</label>
            <div className="flex flex-wrap gap-1.5">
              {PRIZE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPrizePreset(preset.distribution)}
                  disabled={!formPrizePool || Number(formPrizePool) <= 0}
                  className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-medium hover:border-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 hover:text-[var(--color-warning)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Gift size={10} />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prizes editor */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={labelCls}>Призы</label>
              <span
                className={`text-[10px] font-bold ${
                  prizesTotal > 0 && Number(formPrizePool) > 0 && prizesTotal !== Number(formPrizePool)
                    ? 'text-[var(--color-danger)]'
                    : 'text-[var(--color-text-secondary)]'
                }`}
              >
                Итого: {prizesTotal} / {formPrizePool || '0'} AXM
              </span>
            </div>

            <div className="space-y-1.5">
              {prizes.map((prize, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-6 text-center text-[10px] font-bold text-[var(--color-text-secondary)]">
                    #{prize.place}
                  </span>
                  <input
                    value={prize.amount}
                    onChange={(e) => updatePrizeAmount(index, e.target.value)}
                    className={`flex-1 ${inputCls}`}
                    placeholder="Сумма"
                    type="number"
                    min="1"
                  />
                  <span className="text-[10px] text-[var(--color-text-secondary)]">AXM</span>
                  <button
                    type="button"
                    onClick={() => removePrize(index)}
                    disabled={prizes.length <= 1}
                    className="rounded-lg p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] disabled:opacity-20 transition-colors"
                  >
                    <Minus size={12} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addPrize}
              className="mt-1.5 flex items-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Plus size={10} />
              Добавить место
            </button>
          </div>

          {/* Validation errors */}
          {formTouched && formErrors.length > 0 && (
            <div className="space-y-0.5 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2">
              {formErrors.map((err) => (
                <div key={err} className="text-[11px] text-[var(--color-danger)]">
                  &bull; {err}
                </div>
              ))}
            </div>
          )}

          {/* Submit */}
          {editingEventId ? (
            <button
              type="button"
              onClick={() => handleUpdateEvent(editingEventId)}
              disabled={actionLoading === 'update' || (formTouched && !isFormValid)}
              className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors"
            >
              {actionLoading === 'update' ? 'Сохранение...' : 'Сохранить'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCreate(false)}
                disabled={actionLoading === 'create' || actionLoading === 'create-activate' || (formTouched && !isFormValid)}
                className="flex-1 rounded-lg border border-[var(--color-primary)] px-4 py-2.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-40 transition-colors"
              >
                {actionLoading === 'create' ? 'Создание...' : 'Создать черновик'}
              </button>
              <button
                type="button"
                onClick={() => handleCreate(true)}
                disabled={actionLoading === 'create' || actionLoading === 'create-activate' || (formTouched && !isFormValid)}
                className="flex-1 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors"
              >
                {actionLoading === 'create-activate' ? 'Создание...' : 'Создать и активировать'}
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Event Detail Modal */}
      <Modal open={detailOpen} onClose={() => { setDetailOpen(false); setEditMode(false); }} title={detailEvent?.title ?? 'Подробности ивента'} closeOnOverlayClick={false}>
        {detailEvent && (
          <div className="space-y-4">
            {/* Event info — inline edit for active events */}
            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Название</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Описание</label>
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className={inputCls} />
                </div>
                {detailEvent.status === 'active' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Дата окончания</label>
                      <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Время окончания</label>
                      <input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateEvent(detailEvent.id)}
                    disabled={editSaving}
                    className="flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    {editSaving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-bold text-[var(--color-text-secondary)]"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {detailEvent.type === 'contest' ? (
                    <Target size={14} className="text-[var(--color-primary)]" />
                  ) : (
                    <Trophy size={14} className="text-[var(--color-warning)]" />
                  )}
                  <span className="text-xs font-medium capitalize">{detailEvent.type}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      detailEvent.status === 'active'
                        ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                        : detailEvent.status === 'draft'
                          ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
                          : detailEvent.status === 'completed'
                            ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                            : 'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {detailEvent.status}
                  </span>
                </div>
                {detailEvent.description && (
                  <div className="text-[11px] text-[var(--color-text-secondary)]">{detailEvent.description}</div>
                )}
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-text-secondary)]">
                  <div>
                    <span className="font-bold">Начало:</span> {fmtDate(detailEvent.startsAt)}
                  </div>
                  <div>
                    <span className="font-bold">Конец:</span> {fmtDate(detailEvent.endsAt)}
                  </div>
                  <div>
                    <span className="font-bold">Призовой фонд:</span> {formatLaunch(detailEvent.totalPrizePool)} AXM
                  </div>
                  <div>
                    <span className="font-bold">Участников:</span> {detailEvent.participantCount}
                  </div>
                </div>
                {/* Config info */}
                {detailEvent.config && (
                  <div className="text-[11px] text-[var(--color-text-secondary)]">
                    <span className="font-bold">Конфиг:</span>{' '}
                    {formatConfig(detailEvent) ?? 'По умолчанию'}
                  </div>
                )}
                {/* ID for debugging */}
                <div className="text-[10px] font-mono text-[var(--color-text-secondary)]/60">
                  ID: {detailEvent.id}
                </div>
              </div>
            )}

            {/* Quick action buttons in detail modal */}
            <div className="flex flex-wrap gap-2">
              {/* Edit button for draft and active */}
              {(detailEvent.status === 'draft' || detailEvent.status === 'active') && !editMode && (
                <button
                  type="button"
                  onClick={() => {
                    if (detailEvent.status === 'draft') {
                      openEditDraftModal(detailEvent);
                      setDetailOpen(false);
                    } else {
                      startEditMode(detailEvent);
                    }
                  }}
                  className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                >
                  <Pencil size={12} /> Изменить
                </button>
              )}
              {detailEvent.status === 'draft' && (
                <>
                  <button
                    type="button"
                    onClick={() => { handleAction(detailEvent.id, 'activate'); setDetailOpen(false); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1 rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <Play size={12} /> Активировать
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleAction(detailEvent.id, 'delete'); setDetailOpen(false); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1 rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Удалить
                  </button>
                </>
              )}
              {detailEvent.status === 'active' && (
                <>
                  <button
                    type="button"
                    onClick={() => { handleAction(detailEvent.id, 'calculate'); setDetailOpen(false); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1 rounded-lg bg-[var(--color-warning)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <Calculator size={12} /> Завершить и подсчитать
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleAction(detailEvent.id, 'cancel'); setDetailOpen(false); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1 rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <Ban size={12} /> Отменить
                  </button>
                </>
              )}
              {detailEvent.status === 'calculating' && (
                <>
                  <button
                    type="button"
                    onClick={() => { handleAction(detailEvent.id, 'calculate', { force: true }); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1 rounded-lg bg-[var(--color-warning)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <RotateCcw size={12} /> {detailEvent.type === 'raffle' ? 'Перекрутить' : 'Пересчитать'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleAction(detailEvent.id, 'approve'); setDetailOpen(false); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1 rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <CheckCircle size={12} /> Подтвердить результаты
                  </button>
                </>
              )}
              {detailEvent.status === 'completed' && (
                <>
                  {winners.some((w) => !w.prizeTxHash) && (
                    <button
                      type="button"
                      onClick={handleDistributeAll}
                      disabled={distLoading === 'all'}
                      className="flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                    >
                      <Send size={12} /> {distLoading === 'all' ? 'Раздача...' : 'Раздать все'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { handleAction(detailEvent.id, 'archive'); setDetailOpen(false); }}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1 rounded-lg bg-[var(--color-text-secondary)] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    <Archive size={12} /> Архивировать
                  </button>
                </>
              )}
            </div>

            {/* Distribution progress bar */}
            {detailEvent.status === 'completed' && winners.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[var(--color-text-secondary)]">
                  <span className="font-bold">Раздача призов</span>
                  <span>{distributedCount}/{winners.length} отправлено</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-1.5 rounded-full bg-[var(--color-success)] transition-all"
                    style={{ width: `${(distributedCount / winners.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Winners table */}
            {(detailEvent.status === 'completed' || detailEvent.status === 'calculating') && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className={labelCls}>Победители</label>
                    {winners.length > 0 && (
                      <span className="text-[10px] font-bold text-[var(--color-text-secondary)]">
                        {distributedCount}/{winners.length} отправлено
                      </span>
                    )}
                  </div>
                  {detailEvent.status === 'completed' && winners.some((w) => !w.prizeTxHash) && (
                    <button
                      type="button"
                      onClick={handleDistributeAll}
                      disabled={distLoading === 'all'}
                      className="flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
                    >
                      <Send size={10} />
                      {distLoading === 'all' ? 'Раздача...' : 'Раздать все'}
                    </button>
                  )}
                </div>

                {winnersLoading ? (
                  <div className="py-4 text-center text-xs text-[var(--color-text-secondary)]">Загрузка победителей...</div>
                ) : winners.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--color-text-secondary)]">Победителей пока нет</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                          <th className="px-2 py-1.5 text-left font-bold text-[var(--color-text-secondary)]">Место</th>
                          <th className="px-2 py-1.5 text-left font-bold text-[var(--color-text-secondary)]">Адрес</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[var(--color-text-secondary)]">Приз</th>
                          <th className="px-2 py-1.5 text-center font-bold text-[var(--color-text-secondary)]">Статус</th>
                          {detailEvent.status === 'completed' && (
                            <th className="px-2 py-1.5 text-center font-bold text-[var(--color-text-secondary)]">Действие</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {[...winners].sort((a, b) => (a.finalRank ?? 999) - (b.finalRank ?? 999)).map((w, idx) => (
                          <tr key={w.userId ?? w.address} className="border-b border-[var(--color-border)] last:border-b-0">
                            <td className="px-2 py-1.5 font-bold">#{w.finalRank ?? idx + 1}</td>
                            <td className="px-2 py-1.5 font-mono">{shortAddr(w.address)}</td>
                            <td className="px-2 py-1.5 text-right">
                              {w.prizeAmount ? `${formatLaunch(w.prizeAmount)} AXM` : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {w.prizeTxHash ? (
                                <span className="rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">
                                  отправлен
                                </span>
                              ) : (
                                <span className="rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">
                                  ожидание
                                </span>
                              )}
                            </td>
                            {detailEvent.status === 'completed' && (
                              <td className="px-2 py-1.5 text-center">
                                {!w.prizeTxHash && w.userId && (
                                  <button
                                    type="button"
                                    onClick={() => handleDistributeOne(w.userId)}
                                    disabled={distLoading === w.userId || distLoading === 'all'}
                                    className="rounded-lg bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
                                  >
                                    {distLoading === w.userId ? '...' : 'Отправить'}
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Events list */}
      {loading ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">Загрузка...</div>
      ) : events.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">Ивенты не найдены</div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const configStr = formatConfig(event);
            return (
              <div key={event.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2 flex-wrap">
                      {event.type === 'contest' ? (
                        <Target size={12} className="text-[var(--color-primary)]" />
                      ) : (
                        <Trophy size={12} className="text-[var(--color-warning)]" />
                      )}
                      <span className="text-xs font-bold">{event.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          event.status === 'active'
                            ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                            : event.status === 'draft'
                              ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
                              : event.status === 'completed'
                                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                                : 'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {event.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-secondary)]">
                      <span>
                        {fmtDate(event.startsAt)} &mdash; {fmtDate(event.endsAt)}
                      </span>
                      <span>{event.participantCount} участн.</span>
                      <span>Приз: {formatLaunch(event.totalPrizePool)} AXM</span>
                    </div>
                    {configStr && (
                      <div className="mt-1 text-[10px] italic text-[var(--color-text-secondary)]">{configStr}</div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Detail button — available for all statuses */}
                    <button
                      type="button"
                      onClick={() => openDetail(event)}
                      className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-[10px] font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                      title="Подробности"
                    >
                      <Eye size={12} />
                    </button>

                    {/* Draft: Activate + Delete */}
                    {event.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'activate')}
                          disabled={!!actionLoading}
                          className="rounded-lg bg-[var(--color-success)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Активировать"
                        >
                          <Play size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'delete')}
                          disabled={!!actionLoading}
                          className="rounded-lg bg-[var(--color-danger)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Удалить"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}

                    {/* Active: Cancel + Calculate (force end) */}
                    {event.status === 'active' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'calculate')}
                          disabled={!!actionLoading}
                          className="rounded-lg bg-[var(--color-warning)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Завершить и подсчитать"
                        >
                          <Calculator size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'cancel')}
                          disabled={!!actionLoading}
                          className="rounded-lg bg-[var(--color-danger)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Отменить ивент"
                        >
                          <Ban size={12} />
                        </button>
                      </>
                    )}

                    {/* Calculating: Re-calculate/Redraw + Approve */}
                    {event.status === 'calculating' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'calculate', { force: true })}
                          disabled={!!actionLoading}
                          className="rounded-lg bg-[var(--color-warning)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title={event.type === 'raffle' ? 'Перекрутить' : 'Пересчитать'}
                        >
                          <RotateCcw size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'approve')}
                          disabled={!!actionLoading}
                          className="rounded-lg bg-[var(--color-success)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Подтвердить результаты"
                        >
                          <CheckCircle size={12} />
                        </button>
                      </>
                    )}

                    {/* Completed: Distribute + Archive */}
                    {event.status === 'completed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'distribute')}
                          disabled={!!actionLoading}
                          className="rounded-lg bg-[var(--color-primary)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Раздать призы"
                        >
                          <Send size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'archive')}
                          disabled={!!actionLoading}
                          className="rounded-lg bg-[var(--color-text-secondary)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Архивировать"
                        >
                          <Archive size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
