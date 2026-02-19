'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { formatLaunch, toMicroLaunch } from '@coinflip/shared/constants';
import { Trophy, Target, Plus, Play, Calculator, CheckCircle, Archive, Trash2, Clock, Gift, Minus, Eye, Send } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

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
  status: string;
  startsAt: string;
  endsAt: string;
  totalPrizePool: string;
  participantCount: number;
  config?: Record<string, unknown>;
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
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
] as const;

const PRIZE_PRESETS = [
  { label: 'Top 3 (50/30/20%)', distribution: [50, 30, 20] },
  { label: 'Top 5 (40/25/15/12/8%)', distribution: [40, 25, 15, 12, 8] },
] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toLocalTimeStr = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs focus:border-[var(--color-primary)] focus:outline-none transition-colors';
const labelCls = 'text-[10px] font-bold uppercase text-[var(--color-text-secondary)] mb-1 block';

const shortAddr = (addr: string) =>
  addr.length > 15 ? `${addr.slice(0, 10)}...${addr.slice(-4)}` : addr;

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
      setMessage('Failed to load events');
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
      setMessage('Failed to load winners');
    } finally {
      setWinnersLoading(false);
    }
  }, []);

  const openDetail = useCallback(
    (event: EventRow) => {
      setDetailEvent(event);
      setDetailOpen(true);
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
        setMessage(json.data?.message ?? 'Distributed!');
        fetchWinners(detailEvent.id);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Error: ${err?.error?.message ?? 'Unknown error'}`);
      }
    } catch {
      setMessage('Failed to distribute');
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
        setMessage('Prize distributed!');
        fetchWinners(detailEvent.id);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Error: ${err?.error?.message ?? 'Unknown error'}`);
      }
    } catch {
      setMessage('Failed to distribute');
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
    if (!formTitle.trim()) errors.push('Title is required');
    if (!formStartDate || !formStartTime) errors.push('Start date/time required');
    if (!formEndDate || !formEndTime) errors.push('End date/time required');
    if (formStartDate && formStartTime) {
      const start = new Date(`${formStartDate}T${formStartTime}`);
      if (start < new Date()) errors.push('Start date is in the past');
    }
    if (formStartDate && formStartTime && formEndDate && formEndTime) {
      const start = new Date(`${formStartDate}T${formStartTime}`);
      const end = new Date(`${formEndDate}T${formEndTime}`);
      if (end <= start) errors.push('End must be after start');
    }
    const pool = Number(formPrizePool);
    if (!pool || pool <= 0) errors.push('Prize pool is required');
    if (prizes.length === 0) errors.push('At least one prize required');
    if (prizes.some((p) => !p.amount || Number(p.amount) <= 0)) errors.push('All prizes must have amounts');
    if (pool > 0 && prizesTotal > 0 && prizesTotal !== pool) {
      errors.push(`Prizes sum (${prizesTotal}) \u2260 pool (${pool})`);
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
        d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
        ' ' +
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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
    setModalOpen(true);
  }, [resetForm]);

  // --- API handlers ---

  const handleCreate = async () => {
    setFormTouched(true);
    if (!isFormValid) return;

    setActionLoading('create');
    setMessage(null);
    try {
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

      const res = await fetch(`${API_BASE}/api/v1/admin/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          type: formType,
          title: formTitle,
          description: formDesc || undefined,
          startsAt,
          endsAt,
          config,
          prizes: prizesList,
          totalPrizePool: toMicroLaunch(Number(formPrizePool)),
        }),
      });

      if (res.ok) {
        setMessage('Event created!');
        setModalOpen(false);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Error: ${err?.error?.message ?? 'Unknown error'}`);
      }
    } catch {
      setMessage('Failed to create event');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (eventId: string, action: string) => {
    if (action === 'delete' && !window.confirm('Delete this event? This cannot be undone.')) return;

    setActionLoading(`${action}:${eventId}`);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/events/${eventId}/${action}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        setMessage(`${action} successful!`);
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Error: ${err?.error?.message ?? 'Unknown error'}`);
      }
    } catch {
      setMessage(`Failed to ${action}`);
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
    if (event.config.metric) parts.push(`metric: ${event.config.metric}`);
    if (event.config.autoJoin) parts.push('auto-join');
    if (event.config.maxParticipants) parts.push(`max: ${event.config.maxParticipants}`);
    return parts.length > 0 ? parts.join(' \u00b7 ') : null;
  };

  // --- Render ---

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-xs font-medium ${
            message.startsWith('Error') || message.startsWith('Failed')
              ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
              : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
          }`}
        >
          {message}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="calculating">Calculating</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <button
            type="button"
            onClick={fetchEvents}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface)]"
          >
            Refresh
          </button>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)]"
        >
          <Plus size={14} />
          Create Event
        </button>
      </div>

      {/* Create Event Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Event">
        <div className="space-y-4">
          {/* Type & Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'contest' | 'raffle')}
                className={inputCls}
              >
                <option value="contest">Contest</option>
                <option value="raffle">Raffle</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Title</label>
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className={`${inputCls} ${formTouched && !formTitle.trim() ? 'border-[var(--color-danger)]!' : ''}`}
                placeholder="Event title..."
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="Optional description..."
            />
          </div>

          {/* Duration presets */}
          <div>
            <label className={labelCls}>Quick Duration</label>
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
              <label className={labelCls}>Start Date</label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Start Time</label>
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>End Time</label>
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
                <label className={labelCls}>Metric</label>
                <select
                  value={formMetric}
                  onChange={(e) => setFormMetric(e.target.value as 'turnover' | 'wins' | 'profit')}
                  className={inputCls}
                >
                  <option value="turnover">Turnover</option>
                  <option value="wins">Wins</option>
                  <option value="profit">Profit</option>
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
                  Auto-join (all players)
                </label>
              </div>
            </div>
          )}

          {/* Raffle config */}
          {formType === 'raffle' && (
            <div>
              <label className={labelCls}>Max Participants (optional)</label>
              <input
                value={formMaxParticipants}
                onChange={(e) => setFormMaxParticipants(e.target.value)}
                className={inputCls}
                placeholder="Unlimited"
                type="number"
                min="1"
              />
            </div>
          )}

          {/* Prize Pool */}
          <div>
            <label className={labelCls}>Total Prize Pool (LAUNCH)</label>
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
            <label className={labelCls}>Distribution Presets</label>
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
              <label className={labelCls}>Prizes</label>
              <span
                className={`text-[10px] font-bold ${
                  prizesTotal > 0 && Number(formPrizePool) > 0 && prizesTotal !== Number(formPrizePool)
                    ? 'text-[var(--color-danger)]'
                    : 'text-[var(--color-text-secondary)]'
                }`}
              >
                Total: {prizesTotal} / {formPrizePool || '0'} LAUNCH
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
                    placeholder="Amount"
                    type="number"
                    min="1"
                  />
                  <span className="text-[10px] text-[var(--color-text-secondary)]">LAUNCH</span>
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
              Add Prize
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
          <button
            type="button"
            onClick={handleCreate}
            disabled={actionLoading === 'create' || (formTouched && !isFormValid)}
            className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40 transition-colors"
          >
            {actionLoading === 'create' ? 'Creating...' : 'Create Event'}
          </button>
        </div>
      </Modal>

      {/* Event Detail Modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={detailEvent?.title ?? 'Event Details'}>
        {detailEvent && (
          <div className="space-y-4">
            {/* Event info */}
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
                    detailEvent.status === 'completed'
                      ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                      : 'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)]'
                  }`}
                >
                  {detailEvent.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--color-text-secondary)]">
                <div>
                  <span className="font-bold">Start:</span> {fmtDate(detailEvent.startsAt)}
                </div>
                <div>
                  <span className="font-bold">End:</span> {fmtDate(detailEvent.endsAt)}
                </div>
                <div>
                  <span className="font-bold">Prize Pool:</span> {formatLaunch(detailEvent.totalPrizePool)} LAUNCH
                </div>
                <div>
                  <span className="font-bold">Participants:</span> {detailEvent.participantCount}
                </div>
              </div>
            </div>

            {/* Winners table */}
            {(detailEvent.status === 'completed' || detailEvent.status === 'calculating') && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className={labelCls}>Winners</label>
                    {winners.length > 0 && (
                      <span className="text-[10px] font-bold text-[var(--color-text-secondary)]">
                        {distributedCount}/{winners.length} distributed
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
                      {distLoading === 'all' ? 'Distributing...' : 'Distribute All'}
                    </button>
                  )}
                </div>

                {winnersLoading ? (
                  <div className="py-4 text-center text-xs text-[var(--color-text-secondary)]">Loading winners...</div>
                ) : winners.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--color-text-secondary)]">No winners yet</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                          <th className="px-2 py-1.5 text-left font-bold text-[var(--color-text-secondary)]">Rank</th>
                          <th className="px-2 py-1.5 text-left font-bold text-[var(--color-text-secondary)]">Address</th>
                          <th className="px-2 py-1.5 text-right font-bold text-[var(--color-text-secondary)]">Prize</th>
                          <th className="px-2 py-1.5 text-center font-bold text-[var(--color-text-secondary)]">Status</th>
                          {detailEvent.status === 'completed' && (
                            <th className="px-2 py-1.5 text-center font-bold text-[var(--color-text-secondary)]">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {winners.map((w) => (
                          <tr key={w.address} className="border-b border-[var(--color-border)] last:border-b-0">
                            <td className="px-2 py-1.5 font-bold">#{w.finalRank}</td>
                            <td className="px-2 py-1.5 font-mono">{shortAddr(w.address)}</td>
                            <td className="px-2 py-1.5 text-right">
                              {w.prizeAmount ? `${formatLaunch(w.prizeAmount)} LAUNCH` : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {w.prizeTxHash ? (
                                <span className="rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">
                                  distributed
                                </span>
                              ) : (
                                <span className="rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">
                                  pending
                                </span>
                              )}
                            </td>
                            {detailEvent.status === 'completed' && (
                              <td className="px-2 py-1.5 text-center">
                                {!w.prizeTxHash && w.userId && (
                                  <button
                                    type="button"
                                    onClick={() => handleDistributeOne(w.userId)}
                                    disabled={!!distLoading}
                                    className="rounded-lg bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
                                  >
                                    {distLoading === w.userId ? '...' : 'Send'}
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
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">Loading...</div>
      ) : events.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">No events found</div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const configStr = formatConfig(event);
            return (
              <div key={event.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
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
                      <span>{event.participantCount} participants</span>
                      <span>Prize: {formatLaunch(event.totalPrizePool)} LAUNCH</span>
                    </div>
                    {configStr && (
                      <div className="mt-1 text-[10px] italic text-[var(--color-text-secondary)]">{configStr}</div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex shrink-0 items-center gap-1">
                    {(event.status === 'completed' || event.status === 'calculating') && (
                      <button
                        type="button"
                        onClick={() => openDetail(event)}
                        className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-[10px] font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                        title="Details"
                      >
                        <Eye size={12} />
                      </button>
                    )}
                    {event.status === 'draft' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'activate')}
                          disabled={actionLoading === `activate:${event.id}`}
                          className="rounded-lg bg-[var(--color-success)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Activate"
                        >
                          <Play size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(event.id, 'delete')}
                          disabled={actionLoading === `delete:${event.id}`}
                          className="rounded-lg bg-[var(--color-danger)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                    {(event.status === 'active' || event.status === 'calculating') && (
                      <button
                        type="button"
                        onClick={() => handleAction(event.id, 'calculate')}
                        disabled={actionLoading === `calculate:${event.id}`}
                        className="rounded-lg bg-[var(--color-warning)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                        title="Calculate"
                      >
                        <Calculator size={12} />
                      </button>
                    )}
                    {event.status === 'calculating' && (
                      <button
                        type="button"
                        onClick={() => handleAction(event.id, 'approve')}
                        disabled={actionLoading === `approve:${event.id}`}
                        className="rounded-lg bg-[var(--color-success)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                        title="Approve"
                      >
                        <CheckCircle size={12} />
                      </button>
                    )}
                    {event.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleAction(event.id, 'archive')}
                        disabled={actionLoading === `archive:${event.id}`}
                        className="rounded-lg bg-[var(--color-text-secondary)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                        title="Archive"
                      >
                        <Archive size={12} />
                      </button>
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
