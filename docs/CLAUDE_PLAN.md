# Performance Fix Plan

**Baseline tag:** `baseline-pre-perf-fix` (commit `caf96ba`)
**Started:** 2026-03-01

---

## Status Summary

| PR | Scope | Status | Branch |
|----|-------|--------|--------|
| PR-1 | DB indexes + query caches | DONE | `perf/db-indexes-and-caches` |
| PR-2 | Frontend render perf | DONE | `perf/frontend-render` |
| PR-3 | Async deposit 202 | DONE | `perf/async-deposit-202` |
| PR-4 | Balance dedup + WS cleanup | DONE | `perf/balance-dedup-ws-cleanup` |
| PR-5 | RPC failover | DONE | `perf/rpc-failover` |
| PR-6 | CometBFT WS indexer | DONE | `perf/cometbft-ws-indexer` |

**All 6 PRs complete.**

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

---

## PR-2: Frontend Render Performance

**Goal:** React.memo BetCard, remove setLastEvent, fix MyBets infinite rerender, lazy-mount tabs.
**Risk:** LOW. Pure render optimization, no API changes.
**Rollback:** Revert commit.

### Files Changed
- `apps/web/src/components/features/bets/bet-card.tsx` — React.memo wrapper
- `apps/web/src/hooks/use-websocket.ts` — remove setLastEvent
- `apps/web/src/components/features/bets/my-bets.tsx` — memoize myResolved filter
- `apps/web/src/app/game/page.tsx` — lazy-mount hidden tabs

---

## PR-3: Async Deposit 202

**Goal:** Non-blocking deposit endpoint — return 202 immediately, confirm in background via WS.
**Risk:** MEDIUM. Behind `DEPOSIT_ASYNC_MODE` feature flag (default off).
**Rollback:** Set `DEPOSIT_ASYNC_MODE=false` (or remove env var). Revert commit.

### Files Changed
- `apps/api/src/config/env.ts` — add `DEPOSIT_ASYNC_MODE` env var
- `packages/shared/src/types/index.ts` — add `deposit_confirmed` / `deposit_failed` WS event types
- `apps/api/src/routes/vault.ts` — extract `pollTxConfirmation()`, add async 202 path
- `apps/web/src/hooks/use-websocket.ts` — handle deposit_confirmed/deposit_failed events
- `apps/web/src/app/game/page.tsx` — toast notifications for deposit WS events
- `apps/web/src/lib/i18n/en.json` — i18n keys
- `apps/web/src/lib/i18n/ru.json` — i18n keys

---

## PR-4: Balance Dedup + WS Cleanup

**Goal:** Reduce redundant balance polling when WS is connected, increase chain cache TTL.
**Risk:** LOW. Polling still active as fallback when WS disconnected.
**Rollback:** Revert commit.

### Files Changed
- `apps/api/src/routes/vault.ts` — chain cache TTL 10s → 30s
- `apps/web/src/components/features/vault/balance-display.tsx` — WS-aware refetchInterval
- `apps/web/src/hooks/use-wallet-balance.ts` — WS-aware refetchInterval

---

## PR-5: RPC Failover

**Goal:** Centralized chain REST utility with automatic failover to backup URLs on 5xx/network errors.
**Risk:** LOW. Drop-in replacement — same logic, just wrapped in retry-with-fallback.
**Rollback:** Revert commit. All calls revert to direct `fetch(env.AXIOME_REST_URL + ...)`.

### Files Changed
- `apps/api/src/lib/chain-fetch.ts` — NEW: `chainRest()` / `chainRestPost()` with failover
- `apps/api/src/config/env.ts` — add `AXIOME_REST_URLS_FALLBACK` env var
- 10 files: vault.ts, bets.ts, admin.ts, auth.ts, treasury.service.ts, indexer.ts, relayer.ts, background-tasks.ts, treasury-sweep.service.ts, app.ts

---

## PR-6: CometBFT WS Indexer

**Goal:** Real-time chain event indexing via CometBFT WebSocket instead of 3s polling.
**Risk:** MEDIUM. Behind `INDEXER_WS_MODE` feature flag (default off). Polling kept as auto-fallback.
**Rollback:** Set `INDEXER_WS_MODE=false` (or remove env var). Revert commit.

### Files Changed
- `apps/api/src/lib/chain-ws.ts` — NEW: CometBFT WebSocket client with auto-reconnect
- `apps/api/src/config/env.ts` — add `INDEXER_WS_MODE` env var
- `apps/api/src/services/indexer.ts` — add WS mode alongside polling fallback

### How It Works
- When `INDEXER_WS_MODE=true`, connects to CometBFT `/websocket` endpoint
- Subscribes to `tm.event='Tx' AND wasm._contract_address='<contract>'`
- Events arrive in real-time (sub-second vs 3s polling)
- On WS disconnect: polling auto-resumes as fallback
- On WS reconnect: polls missed blocks, then resumes WS mode
- `getStatus()` reports `wsMode` and `wsConnected` for monitoring

### Verification Checklist
- [ ] Set `INDEXER_WS_MODE=true` → WS connects to CometBFT
- [ ] Create/accept/reveal bet → events appear in DB within ~1s
- [ ] Kill WS connection → polling resumes automatically
- [ ] WS reconnects → missed blocks are backfilled
- [ ] `INDEXER_WS_MODE=false` (default) → polling mode unchanged
- [ ] `/api/v1/admin/indexer/status` shows wsMode/wsConnected

### Expected Effect
- Event latency: 3s (polling) → <1s (WS real-time)
- Chain API load: ~20 req/min (polling every 3s) → ~1 req/min (WS + occasional backfill)

---

## Rules Reminder
- One PR = one goal, max 5-10 files
- Risky changes under feature flag (DEPOSIT_ASYNC_MODE, INDEXER_WS_MODE)
- No business logic / fairness changes
- No on-chain contract / key changes
- DB migrations: CREATE INDEX CONCURRENTLY only
- Migration first, then code
