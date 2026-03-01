# Performance Fix Plan

**Baseline tag:** `baseline-pre-perf-fix` (commit `caf96ba`)
**Started:** 2026-03-01

---

## Status Summary

| PR | Scope | Status | Branch |
|----|-------|--------|--------|

| PR-3 | Async deposit 202 | PENDING | — |
| PR-4 | Balance dedup + WS cleanup | DONE | `perf/balance-dedup-ws-cleanup` |
| PR-5 | RPC failover | PENDING | — |
| PR-6 | CometBFT WS indexer | PENDING | — |

---

## PR-1: DB Indexes + Query Caches

**Goal:** Add missing indexes, add in-memory cache for leaderboard/topWinner/userStats.
**Risk:** LOW. Indexes are CONCURRENTLY. Caches are read-only wrappers.
**Rollback:** Drop indexes via SQL. Remove cache wrappers (revert commit).

### Files Changed
- `packages/db/src/schema/bets.ts` — add `winner_user_id` index to Drizzle schema
- `packages/db/src/schema/vip.ts` — add composite VIP index to Drizzle schema
- `packages/db/src/schema/users.ts` — add `telegram_id` index to Drizzle schema
- `apps/api/src/services/user.service.ts` — add 60s cache for `getLeaderboard()`, `getTopWinner()`, `getUserStats()`
- DB migration via Neon MCP (CREATE INDEX CONCURRENTLY)

### Verification Checklist

- [ ] Deposit: send → pending → confirmed → balance updated
- [ ] Bet flow: create → accept → reveal → jackpot/referral intact
- [ ] Leaderboard: loads correctly, data matches, updates within 60s
- [ ] TopWinner: displays correct winner, updates within 60s
- [ ] User stats (/me): correct counts, updates within 60s
- [ ] No errors in API logs after deploy

### Expected Effect
- Leaderboard p95: ~500ms+ → <100ms (cached)
- TopWinner p95: ~300ms+ → <50ms (cached)
- UserStats p95: ~200ms → <50ms (cached per user)
- Measurement: check Railway logs for endpoint timings before/after

---

## PR-2: Frontend Render Performance

**Goal:** React.memo BetCard, remove setLastEvent, fix MyBets infinite rerender, lazy-mount tabs.
**Risk:** LOW. Pure render optimization, no API changes.
**Rollback:** Revert commit.

### Files Changed
- `apps/web/src/components/features/bets/bet-card.tsx` — React.memo wrapper

- [ ] Mobile: pull-to-refresh still works

### Expected Effect
- Re-renders per second: ~100 (50 timers) → ~50 (still per-card, but memo prevents cascade)
- Hidden tabs stop polling → -75% background API requests
- Measurement: React DevTools Profiler, Network tab request count

---

## PR-4: Balance Dedup + WS Cleanup

**Goal:** Reduce redundant balance polling/RPC calls. WS-aware refetch intervals. Increase chain cache TTL.
**Risk:** LOW. Only affects polling intervals and cache TTL.
**Rollback:** Revert commit.

### Files Changed
- `apps/api/src/routes/vault.ts` — chain cache TTL 10s → 30s
- `apps/web/src/components/features/vault/balance-display.tsx` — WS-aware refetchInterval
- `apps/web/src/hooks/use-wallet-balance.ts` — WS-aware refetchInterval for CW20 balance

### Verification Checklist
- [x] `pnpm --filter @coinflip/api typecheck` passes
- [x] `pnpm --filter @coinflip/web typecheck` passes
- [ ] Balance updates correctly after deposit/withdraw
- [ ] Balance updates via WS events (no stale display)
- [ ] When WS disconnected: polling every 15s
- [ ] When WS connected: polling every 30s
- [ ] Chain RPC calls reduced (check Railway logs)

### Expected Effect
- Chain RPC calls for balance: 6/min per user → 2/min (30s cache + 30s WS poll)
- CW20 wallet balance polling: 4/min → 2/min when WS connected
- Measurement: Network tab request count, Railway logs

---

## Rules Reminder
- One PR = one goal, max 5-10 files
- Risky changes under feature flag (DEPOSIT_ASYNC_MODE, INDEXER_WS_MODE)
- No business logic / fairness changes
- No on-chain contract / key changes
- DB migrations: CREATE INDEX CONCURRENTLY only
- Migration first, then code
