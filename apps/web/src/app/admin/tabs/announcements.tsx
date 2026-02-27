'use client';

import { useState } from 'react';
import { useAdminAnnouncements, useAdminSendAnnouncement } from '@/hooks/use-admin';
import { TableWrapper, Pagination, ActionButton, timeAgo } from '../_shared';
import { Megaphone, Send, AlertTriangle, Info } from 'lucide-react';

export function AnnouncementsTab() {
  const [page, setPage] = useState(0);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important'>('normal');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const { data } = useAdminAnnouncements(page);
  const sendMutation = useAdminSendAnnouncement();

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
    } catch (err: any) {
      setLastResult(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
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
          {lastResult && (
            <span className={`text-xs ${lastResult.startsWith('Error') ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
              {lastResult}
            </span>
          )}
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold">Announcement History</h3>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
            <p className="text-xs text-[var(--color-text-secondary)]">No announcements yet</p>
          </div>
        ) : (
          <TableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Title</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Message</th>
                  <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">Priority</th>
                  <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">Sent</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate">{a.title}</td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)] max-w-[300px] truncate">{a.message}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        a.priority === 'important'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                      }`}>
                        {a.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{a.sentCount}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text-secondary)]">{timeAgo(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagination && pagination.total > 0 && (
              <Pagination
                page={page}
                total={pagination.total}
                limit={pagination.limit}
                hasMore={pagination.hasMore}
                onPageChange={setPage}
              />
            )}
          </TableWrapper>
        )}
      </div>
    </div>
  );
}
