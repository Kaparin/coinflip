'use client';

import { useState } from 'react';
import { formatLaunch, fromMicroLaunch, toMicroLaunch } from '@coinflip/shared/constants';
import { Trophy, Target, Plus, Play, Calculator, CheckCircle, Archive, Trash2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface EventRow {
  id: string;
  type: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalPrizePool: string;
  participantCount: number;
}

type FormMode = 'create' | 'idle';

export function EventsTab() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [formMode, setFormMode] = useState<FormMode>('idle');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Form state
  const [formType, setFormType] = useState<'contest' | 'raffle'>('contest');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formEndsAt, setFormEndsAt] = useState('');
  const [formMetric, setFormMetric] = useState<'turnover' | 'wins' | 'profit'>('turnover');
  const [formAutoJoin, setFormAutoJoin] = useState(true);
  const [formPrizePool, setFormPrizePool] = useState('');
  const [formPrizes, setFormPrizes] = useState('1:500\n2:300\n3:200');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const url = statusFilter
        ? `${API_BASE}/api/v1/admin/events?status=${statusFilter}`
        : `${API_BASE}/api/v1/admin/events`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setEvents(json.data ?? []);
      }
    } catch {
      setMessage('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useState(() => { fetchEvents(); });

  const handleCreate = async () => {
    setActionLoading('create');
    setMessage(null);
    try {
      const prizes = formPrizes.split('\n').filter(Boolean).map((line) => {
        const [place, amount] = line.split(':');
        return { place: Number(place), amount: toMicroLaunch(Number(amount)), label: `#${place}` };
      });

      const config = formType === 'contest'
        ? { metric: formMetric, autoJoin: formAutoJoin }
        : {};

      const res = await fetch(`${API_BASE}/api/v1/admin/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          title: formTitle,
          description: formDesc || undefined,
          startsAt: new Date(formStartsAt).toISOString(),
          endsAt: new Date(formEndsAt).toISOString(),
          config,
          prizes,
          totalPrizePool: toMicroLaunch(Number(formPrizePool)),
        }),
      });

      if (res.ok) {
        setMessage('Event created!');
        setFormMode('idle');
        fetchEvents();
      } else {
        const err = await res.json();
        setMessage(`Error: ${err?.error?.message ?? 'Unknown error'}`);
      }
    } catch (err) {
      setMessage('Failed to create event');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (eventId: string, action: string) => {
    setActionLoading(`${action}:${eventId}`);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/events/${eventId}/${action}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        credentials: 'include',
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

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
          message.startsWith('Error') ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]' : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
        }`}>
          {message}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setTimeout(fetchEvents, 0); }}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="calculating">Calculating</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <button type="button" onClick={fetchEvents} className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface)]">
            Refresh
          </button>
        </div>
        <button
          type="button"
          onClick={() => setFormMode(formMode === 'create' ? 'idle' : 'create')}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--color-primary-hover)]"
        >
          <Plus size={14} />
          Create Event
        </button>
      </div>

      {/* Create form */}
      {formMode === 'create' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
          <h3 className="text-sm font-bold">New Event</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Type</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value as 'contest' | 'raffle')}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs">
                <option value="contest">Contest</option>
                <option value="raffle">Raffle</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Title</label>
              <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                placeholder="Event title..." />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Description</label>
            <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
              placeholder="Optional description..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Starts at</label>
              <input type="datetime-local" value={formStartsAt} onChange={(e) => setFormStartsAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Ends at</label>
              <input type="datetime-local" value={formEndsAt} onChange={(e) => setFormEndsAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs" />
            </div>
          </div>

          {formType === 'contest' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Metric</label>
                <select value={formMetric} onChange={(e) => setFormMetric(e.target.value as 'turnover' | 'wins' | 'profit')}
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs">
                  <option value="turnover">Turnover</option>
                  <option value="wins">Wins</option>
                  <option value="profit">Profit</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={formAutoJoin} onChange={(e) => setFormAutoJoin(e.target.checked)} className="rounded" />
                  Auto-join (all players)
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Total Prize Pool (LAUNCH)</label>
              <input value={formPrizePool} onChange={(e) => setFormPrizePool(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
                placeholder="1000" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)]">Prizes (place:LAUNCH per line)</label>
              <textarea value={formPrizes} onChange={(e) => setFormPrizes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs font-mono" />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={actionLoading === 'create' || !formTitle || !formStartsAt || !formEndsAt}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              {actionLoading === 'create' ? 'Creating...' : 'Create Event'}
            </button>
            <button type="button" onClick={() => setFormMode('idle')}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      {loading ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">Loading...</div>
      ) : events.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">No events found</div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {event.type === 'contest' ? (
                      <Target size={12} className="text-[var(--color-primary)]" />
                    ) : (
                      <Trophy size={12} className="text-[var(--color-warning)]" />
                    )}
                    <span className="text-xs font-bold">{event.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      event.status === 'active' ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' :
                      event.status === 'draft' ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]' :
                      event.status === 'completed' ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]' :
                      'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)]'
                    }`}>
                      {event.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-secondary)]">
                    <span>{fmtDate(event.startsAt)} — {fmtDate(event.endsAt)}</span>
                    <span>{event.participantCount} participants</span>
                    <span>Prize: {formatLaunch(event.totalPrizePool)} LAUNCH</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {event.status === 'draft' && (
                    <>
                      <button type="button" onClick={() => handleAction(event.id, 'activate')}
                        disabled={actionLoading === `activate:${event.id}`}
                        className="rounded-lg bg-[var(--color-success)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                        title="Activate">
                        <Play size={12} />
                      </button>
                      <button type="button" onClick={() => handleAction(event.id, 'delete')}
                        disabled={actionLoading === `delete:${event.id}`}
                        className="rounded-lg bg-[var(--color-danger)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                        title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                  {(event.status === 'active' || event.status === 'calculating') && (
                    <button type="button" onClick={() => handleAction(event.id, 'calculate')}
                      disabled={actionLoading === `calculate:${event.id}`}
                      className="rounded-lg bg-[var(--color-warning)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                      title="Calculate">
                      <Calculator size={12} />
                    </button>
                  )}
                  {event.status === 'calculating' && (
                    <button type="button" onClick={() => handleAction(event.id, 'approve')}
                      disabled={actionLoading === `approve:${event.id}`}
                      className="rounded-lg bg-[var(--color-success)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                      title="Approve">
                      <CheckCircle size={12} />
                    </button>
                  )}
                  {event.status === 'completed' && (
                    <>
                      <button type="button" onClick={() => handleAction(event.id, 'distribute')}
                        disabled={actionLoading === `distribute:${event.id}`}
                        className="rounded-lg bg-[var(--color-primary)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                        title="Distribute">
                        Dist
                      </button>
                      <button type="button" onClick={() => handleAction(event.id, 'archive')}
                        disabled={actionLoading === `archive:${event.id}`}
                        className="rounded-lg bg-[var(--color-text-secondary)] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
                        title="Archive">
                        <Archive size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
