'use client';

export function StatCard({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border bg-[var(--color-surface)] p-4 ${warn ? 'border-[var(--color-danger)]/40' : 'border-[var(--color-border)]'}`}>
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">{label}</p>
      <p className={`text-xl font-bold ${warn ? 'text-[var(--color-danger)]' : ''}`}>{value}</p>
      {sub && <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

export function shortHash(hash: string | null | undefined): string {
  if (!hash || hash.length < 16) return hash ?? '';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function shortAddr(addr: string | null | undefined): string {
  if (!addr || addr.length < 20) return addr ?? '';
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-green-500/15 text-green-400',
    accepted: 'bg-blue-500/15 text-blue-400',
    accepting: 'bg-yellow-500/15 text-yellow-400',
    canceling: 'bg-orange-500/15 text-orange-400',
    creating: 'bg-purple-500/15 text-purple-400',
    revealed: 'bg-cyan-500/15 text-cyan-400',
    canceled: 'bg-gray-500/15 text-gray-400',
    timeout_claimed: 'bg-red-500/15 text-red-400',
  };

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${colors[status] ?? 'bg-gray-500/15 text-gray-400'}`}>
      {status}
    </span>
  );
}

export function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden overflow-x-auto">
      {children}
    </div>
  );
}

export function Pagination({ page, total, limit, hasMore, onPageChange }: {
  page: number;
  total: number;
  limit: number;
  hasMore: boolean;
  onPageChange: (p: number) => void;
}) {
  const offset = page * limit;
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
      <span className="text-[10px] text-[var(--color-text-secondary)]">
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-30">
          Prev
        </button>
        <button type="button" disabled={!hasMore} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs disabled:opacity-30">
          Next
        </button>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none w-full max-w-xs"
    />
  );
}

export function ActionButton({ children, onClick, disabled, variant = 'default' }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'success';
}) {
  const styles = {
    default: 'border-[var(--color-border)] hover:bg-[var(--color-border)]/30',
    danger: 'border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10',
    success: 'border-green-500/30 text-green-400 hover:bg-green-500/10',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-30 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
