'use client';

import { useState } from 'react';
import {
  useAdminAnnouncements,
  useAdminSendAnnouncement,
  useAdminDeleteAnnouncement,
  useAdminPendingSponsored,
  useAdminApproveSponsored,
  useAdminRejectSponsored,
  type AdminAnnouncement,
  type PendingSponsored,
} from '@/hooks/use-admin';
import { Pagination, ActionButton, timeAgo, shortAddr } from '../_shared';
import {
  Megaphone,
  Send,
  AlertTriangle,
  Info,
  Trash2,
  Check,
  X,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Eye,
  Pencil,
  Save,
} from 'lucide-react';
import { formatLaunch } from '@coinflip/shared/constants';

export function AnnouncementsTab() {
  const [page, setPage] = useState(0);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important'>('normal');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const { data } = useAdminAnnouncements(page);
  const { data: pending } = useAdminPendingSponsored();
  const sendMutation = useAdminSendAnnouncement();
  const deleteMutation = useAdminDeleteAnnouncement();

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setLastResult(null);
    try {
      const result = await sendMutation.mutateAsync({ title: title.trim(), message: message.trim(), priority });
      setLastResult(`Sent to ${result.sentCount} users`);
      setTitle('');
      setMessage('');
      setPriority('normal');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setLastResult(`Error: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      setLastResult('Announcement deleted');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setLastResult(`Error: ${msg}`);
    }
  };

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      {/* Pending Sponsored — show at top if any */}
      {pending && pending.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
              <Clock size={16} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Pending Review</h3>
              <p className="text-[10px] text-[var(--color-text-secondary)]">
                {pending.length} sponsored announcement{pending.length > 1 ? 's' : ''} awaiting approval
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {pending.map((item) => (
              <PendingSponsoredCard key={item.id} item={item} onResult={setLastResult} />
            ))}
          </div>
        </div>
      )}

      {/* Result feedback */}
      {lastResult && (
        <div className={`rounded-lg px-4 py-2 text-xs ${lastResult.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {lastResult}
        </div>
      )}

      {/* Create Announcement */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Megaphone size={18} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-bold">New Announcement</h3>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title..."
            maxLength={200}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your announcement..."
            maxLength={2000}
            rows={4}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none resize-none"
          />
          <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{message.length}/2000</p>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1">Priority</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPriority('normal')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                priority === 'normal'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              <Info size={12} />
              Normal
            </button>
            <button
              type="button"
              onClick={() => setPriority('important')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                priority === 'important'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              <AlertTriangle size={12} />
              Important
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ActionButton
            onClick={handleSend}
            disabled={sending || !title.trim() || !message.trim()}
            variant="success"
          >
            <span className="flex items-center gap-1.5">
              <Send size={12} />
              {sending ? 'Sending...' : 'Send to All Users'}
            </span>
          </ActionButton>
        </div>
      </div>

      {/* History — card-based */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold">Announcement History</h3>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
            <p className="text-xs text-[var(--color-text-secondary)]">No announcements yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((a) => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending}
                onResult={setLastResult}
              />
            ))}

            {pagination && pagination.total > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                <Pagination
                  page={page}
                  total={pagination.total}
                  limit={pagination.limit}
                  hasMore={pagination.hasMore}
                  onPageChange={setPage}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Announcement Card (history) ──────────────────────────── */

function AnnouncementStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    published: 'bg-green-500/15 text-green-400',
    pending: 'bg-amber-500/15 text-amber-400',
    approved: 'bg-blue-500/15 text-blue-400',
    rejected: 'bg-red-500/15 text-red-400',
    deleted: 'bg-gray-500/15 text-gray-400',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${colors[status] ?? 'bg-gray-500/15 text-gray-400'}`}>
      {status}
    </span>
  );
}

function AnnouncementCard({
  announcement: a,
  onDelete,
  isDeleting,
  onResult,
}: {
  announcement: AdminAnnouncement;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  onResult: (msg: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const approve = useAdminApproveSponsored();
  const reject = useAdminRejectSponsored();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isSponsored = !!a.userId;
  const isPending = a.status === 'pending';
  const isDeleted = a.status === 'deleted';

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(a.id);
      onResult('Sponsored announcement approved & published');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onResult(`Error: ${msg}`);
    }
  };

  const handleReject = async () => {
    try {
      await reject.mutateAsync({ id: a.id, reason: rejectReason || undefined });
      setShowReject(false);
      onResult('Sponsored announcement rejected, funds refunded');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onResult(`Error: ${msg}`);
    }
  };

  return (
    <div className={`rounded-xl border bg-[var(--color-surface)] overflow-hidden ${
      isPending ? 'border-amber-500/30' : isDeleted ? 'border-gray-500/20 opacity-60' : 'border-[var(--color-border)]'
    }`}>
      {/* Header — always visible */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
          isSponsored ? 'bg-teal-500/15' : 'bg-[var(--color-primary)]/15'
        }`}>
          <Megaphone size={14} className={isSponsored ? 'text-teal-400' : 'text-[var(--color-primary)]'} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold truncate">{a.title}</h4>
            <AnnouncementStatusBadge status={a.status} />
            {a.priority === 'important' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-400 px-1.5 py-0.5 text-[9px] font-bold">
                <AlertTriangle size={8} /> IMPORTANT
              </span>
            )}
            {isSponsored && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-500/15 text-teal-400 px-1.5 py-0.5 text-[9px] font-bold">
                SPONSORED
              </span>
            )}
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[10px] text-[var(--color-text-secondary)]">
            <span>{timeAgo(a.createdAt)}</span>
            {a.sentCount > 0 && <span>Sent to {a.sentCount} users</span>}
            {a.pricePaid && <span>Paid: <span className="text-teal-400">{formatLaunch(a.pricePaid)} COIN</span></span>}
          </div>

          {/* Truncated message preview */}
          {!expanded && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 line-clamp-2">{a.message}</p>
          )}
        </div>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          title={expanded ? 'Collapse' : 'View full message'}
        >
          {expanded ? <ChevronUp size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {/* Expanded — full message */}
      {expanded && (
        <div className="px-4 pb-3">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">Full Message</p>
            <p className="text-xs leading-relaxed whitespace-pre-wrap">{a.message}</p>
          </div>

          {a.scheduledAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] mt-2">
              <Clock size={12} />
              Scheduled for: {new Date(a.scheduledAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!isDeleted && (
        <div className="px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50">
          {showReject ? (
            /* Reject form */
            <div className="space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason (optional)..."
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-red-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={reject.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500/15 border border-red-500/30 py-2 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                >
                  {reject.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                  Reject & Refund
                </button>
                <button
                  type="button"
                  onClick={() => setShowReject(false)}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {/* Approve/Reject for pending sponsored */}
              {isPending && isSponsored && (
                <>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approve.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-green-500/15 border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50"
                  >
                    {approve.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Approve & Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReject(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors"
                  >
                    <X size={12} />
                    Reject
                  </button>
                </>
              )}

              {/* Delete — for all non-deleted */}
              <button
                type="button"
                onClick={() => onDelete(a.id)}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Pending Sponsored Card (top section) ──────────────────── */

function PendingSponsoredCard({ item, onResult }: { item: PendingSponsored; onResult: (msg: string) => void }) {
  const approve = useAdminApproveSponsored();
  const reject = useAdminRejectSponsored();
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(item.id);
      onResult('Sponsored announcement approved & published');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onResult(`Error: ${msg}`);
    }
  };

  const handleReject = async () => {
    try {
      await reject.mutateAsync({ id: item.id, reason: rejectReason || undefined });
      setShowReject(false);
      onResult('Sponsored announcement rejected, funds refunded');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onResult(`Error: ${msg}`);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header — always visible */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/15">
          <Megaphone size={14} className="text-teal-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold truncate">{item.title}</h4>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-[var(--color-text-secondary)]">
            <span>From: <span className="text-[var(--color-text-primary)]">{item.userNickname || shortAddr(item.userAddress)}</span></span>
            {item.pricePaid && <span>Paid: <span className="text-teal-400">{formatLaunch(item.pricePaid)} COIN</span></span>}
            <span>{timeAgo(item.createdAt)}</span>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          title={expanded ? 'Collapse' : 'Preview full message'}
        >
          {expanded ? <ChevronUp size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {/* Expanded content — full message preview */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">Message Preview</p>
            <p className="text-xs leading-relaxed whitespace-pre-wrap">{item.message}</p>
          </div>

          {item.scheduledAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
              <Clock size={12} />
              Scheduled for: {new Date(item.scheduledAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Action buttons — always visible */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50">
        {showReject ? (
          <div className="space-y-2">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rejection reason (optional)..."
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs focus:border-red-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={reject.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500/15 border border-red-500/30 py-2 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                {reject.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                Reject & Refund
              </button>
              <button
                type="button"
                onClick={() => setShowReject(false)}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={approve.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500/15 border border-green-500/30 py-2 text-xs font-medium text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50"
            >
              {approve.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
              Approve & Publish
            </button>
            <button
              type="button"
              onClick={() => setShowReject(true)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500/15 border border-red-500/30 py-2 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors"
            >
              <X size={14} />
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
