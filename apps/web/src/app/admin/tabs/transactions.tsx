'use client';

import { useState, useCallback, useEffect } from 'react';
import { ArrowLeftRight, ExternalLink, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { EXPLORER_URL } from '@/lib/constants';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function getAuthHeaders(): Record<string, string> {
  const addr = typeof window !== 'undefined'
    ? sessionStorage.getItem('coinflip_connected_address')
    : null;
  return addr ? { 'x-wallet-address': addr } : {};
}

interface TxRow {
  id: string;
  txHash: string | null;
  userAddress: string;
  contractAddress: string | null;
  action: string;
  actionPayload: unknown;
  memo: string | null;
  success: boolean | null;
  code: number | null;
  rawLog: string | null;
  height: number | null;
  durationMs: number | null;
  attempt: number | null;
  description: string | null;
  createdAt: string;
}

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'create_bet', label: 'Create Bet' },
  { value: 'accept_bet', label: 'Accept Bet' },
  { value: 'accept_and_reveal', label: 'Accept & Reveal' },
  { value: 'reveal', label: 'Reveal' },
  { value: 'cancel_bet', label: 'Cancel Bet' },
  { value: 'claim_timeout', label: 'Claim Timeout' },
  { value: 'withdraw', label: 'Withdraw' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'transfer', label: 'CW20 Transfer' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'true', label: 'Success' },
  { value: 'false', label: 'Failed' },
];

const shortAddr = (addr: string) =>
  addr.length > 15 ? `${addr.slice(0, 10)}...${addr.slice(-4)}` : addr;

const shortHash = (hash: string) =>
  hash.length > 16 ? `${hash.slice(0, 8)}...${hash.slice(-4)}` : hash;

const PAGE_SIZE = 50;

export function TransactionsTab() {
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const fetchTxs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      if (actionFilter) params.set('action', actionFilter);
      if (statusFilter) params.set('success', statusFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(
        `${API_BASE}/api/v1/admin/relayer-transactions?${params.toString()}`,
        { credentials: 'include', headers: { ...getAuthHeaders() } },
      );
      if (res.ok) {
        const json = await res.json();
        setTxs(json.data ?? []);
        setTotal(json.total ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [offset, actionFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchTxs();
  }, [fetchTxs]);

  const handleSearch = () => {
    setOffset(0);
    setSearchQuery(searchInput);
  };

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setOffset(0);
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ArrowLeftRight size={16} className="text-[var(--color-primary)]" />
        <span className="text-sm font-bold">Relayer Transactions</span>
        <span className="text-[10px] text-[var(--color-text-secondary)]">({total} total)</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={actionFilter}
          onChange={handleFilterChange(setActionFilter)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={handleFilterChange(setStatusFilter)}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search address / tx hash..."
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs w-56 focus:border-[var(--color-primary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="rounded-lg border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-surface)]"
          >
            <Search size={12} />
          </button>
        </div>

        <button
          type="button"
          onClick={fetchTxs}
          className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-surface)]"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">Loading...</div>
      ) : txs.length === 0 ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-secondary)]">No transactions found</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <th className="px-2 py-2 text-left font-bold text-[var(--color-text-secondary)]">Date</th>
                <th className="px-2 py-2 text-left font-bold text-[var(--color-text-secondary)]">Action</th>
                <th className="px-2 py-2 text-left font-bold text-[var(--color-text-secondary)]">User</th>
                <th className="px-2 py-2 text-left font-bold text-[var(--color-text-secondary)]">Tx Hash</th>
                <th className="px-2 py-2 text-left font-bold text-[var(--color-text-secondary)]">Description</th>
                <th className="px-2 py-2 text-center font-bold text-[var(--color-text-secondary)]">Status</th>
                <th className="px-2 py-2 text-right font-bold text-[var(--color-text-secondary)]">Duration</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg)]/50">
                  <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(tx.createdAt)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className="rounded-md bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-primary)]">
                      {tx.action}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono">{shortAddr(tx.userAddress)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {tx.txHash ? (
                      <a
                        href={`${EXPLORER_URL}/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 font-mono text-[var(--color-primary)] hover:underline"
                      >
                        {shortHash(tx.txHash)}
                        <ExternalLink size={9} />
                      </a>
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">-</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-1.5" title={tx.description ?? undefined}>
                    {tx.description ?? '-'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-center">
                    {tx.success === true ? (
                      <span className="rounded-full bg-[var(--color-success)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">
                        success
                      </span>
                    ) : tx.success === false ? (
                      <span className="rounded-full bg-[var(--color-danger)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-danger)]">
                        failed
                      </span>
                    ) : (
                      <span className="rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">
                        pending
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {tx.durationMs != null ? `${(tx.durationMs / 1000).toFixed(1)}s` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="rounded-lg border border-[var(--color-border)] p-1.5 disabled:opacity-30 hover:bg-[var(--color-surface)]"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="rounded-lg border border-[var(--color-border)] p-1.5 disabled:opacity-30 hover:bg-[var(--color-surface)]"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
