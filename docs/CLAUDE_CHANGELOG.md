# Performance Fix Changelog

**Baseline:** `baseline-pre-perf-fix` (commit `caf96ba`)

Each entry: file, lines changed, why, how to rollback.

---

## PR-1: DB Indexes + Query Caches

### DB Indexes (via Neon MCP, CREATE INDEX CONCURRENTLY)

| Index | Table | Why | Rollback |
|-------|-------|-----|----------|
| `bets_winner_idx` | bets | `winner_user_id` used in stats, top winner, activity, leaderboard CTE — was full table scan | `DROP INDEX bets_winner_idx` |
| `bets_payout_desc_idx` | bets | `payout_amount DESC` sort in getTopWinner — was full table scan + sort | `DROP INDEX bets_payout_desc_idx` |
| `idx_vip_sub_active` | vip_subscriptions | Composite (user_id, expires_at DESC) WHERE canceled_at IS NULL — correlated subquery in 8+ queries | `DROP INDEX idx_vip_sub_active` |
| `users_telegram_id_idx` | users | Unique on telegram_id — TG auth lookup was seq scan | `DROP INDEX users_telegram_id_idx` |
| `profile_reactions_to_user_idx` | profile_reactions | to_user_id — profile reaction counts were seq scan | `DROP INDEX profile_reactions_to_user_idx` |

### Schema Files (Drizzle sync)

| File | Change | Rollback |
|------|--------|----------|
| `packages/db/src/schema/bets.ts` | Added `bets_winner_idx`, `bets_payout_desc_idx` to index list | Revert commit |
| `packages/db/src/schema/users.ts` | Added `users_telegram_id_idx` uniqueIndex, imported `index`/`uniqueIndex` | Revert commit |
| `packages/db/src/schema/vip.ts` | Added `idx_vip_sub_active` composite index | Revert commit |
| `packages/db/src/schema/profile-reactions.ts` | Added `profile_reactions_to_user_idx`, imported `index` | Revert commit |

### Query Caches

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/services/user.service.ts` | Added simple in-memory TTL cache (Map-based). Wrapped `getUserStats()` (30s TTL), `getLeaderboard()` (60s TTL), `getTopWinner()` (60s TTL) | These queries scan entire bets table, called every 30-60s per user. Cache collapses N concurrent calls to 1 DB query per TTL. | Revert commit (remove cache code, functions revert to direct DB calls) |

---

## PR-2: Frontend Render Performance

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/web/src/components/features/bets/bet-card.tsx` | Wrapped component with `React.memo()` | Prevents re-render of all 50 bet cards when any parent state changes (timers, WS events) | Revert commit |
| `apps/web/src/hooks/use-websocket.ts` | Removed `setLastEvent` state update | `lastEvent` was set but never read — caused unnecessary re-renders on every WS message | Revert commit |
| `apps/web/src/components/features/bets/my-bets.tsx` | Added `useMemo` on `myResolved` filter | `filter()` ran every render, creating new array reference → infinite rerender | Revert commit |
| `apps/web/src/app/game/page.tsx` | Added `visitedTabs` state for lazy-mount tabs | Hidden tabs were mounted and polling even when never visited. Now mount-on-first-visit. | Revert commit |

---

## PR-3: Async Deposit 202

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/config/env.ts` | Added `DEPOSIT_ASYNC_MODE` env var (default `'false'`) | Feature flag for async deposit. When `'true'`, deposit returns 202 immediately. | Remove env var or set `'false'` |
| `packages/shared/src/types/index.ts` | Added `deposit_confirmed` / `deposit_failed` to `WsEventType` | New WS events for async deposit notification | Revert commit |
| `apps/api/src/routes/vault.ts` | Extracted `pollTxConfirmation()` helper; added async 202 path when `DEPOSIT_ASYNC_MODE=true` | Releases inflight guard early, spawns background poll, returns 202. Background emits WS events. Sync path unchanged. | Set `DEPOSIT_ASYNC_MODE=false` or revert |
| `apps/web/src/hooks/use-websocket.ts` | Added `deposit_confirmed`/`deposit_failed` cases to event switch | Invalidate balance cache on deposit confirmation/failure | Revert commit |
| `apps/web/src/app/game/page.tsx` | Added toast notifications for deposit confirmed/failed | User feedback when async deposit completes | Revert commit |
| `apps/web/src/lib/i18n/en.json` | Added `depositConfirmedWs`, `depositFailedWs` keys | i18n for toast messages | Revert commit |
| `apps/web/src/lib/i18n/ru.json` | Added `depositConfirmedWs`, `depositFailedWs` keys | i18n for toast messages | Revert commit |

---

## PR-4: Balance Dedup + WS Cleanup

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/routes/vault.ts` | Chain cache TTL `10_000` → `30_000` for vault balance | Reduces redundant chain queries. WS events trigger immediate invalidation anyway. | Change `30_000` back to `10_000` |
| `apps/web/src/components/features/vault/balance-display.tsx` | `refetchInterval: 15_000` → WS-aware function: 60s when WS connected, 10s when disconnected, skip during grace period | Was polling every 15s regardless of WS status. Now 4x less frequent when WS is active. | Revert to `refetchInterval: 15_000` |
| `apps/web/src/hooks/use-wallet-balance.ts` | Same WS-aware refetchInterval pattern | Same reasoning — reduce redundant polling | Revert to `refetchInterval: 15_000` |

---

## PR-5: RPC Failover

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/lib/chain-fetch.ts` | **NEW** — `chainRest()` and `chainRestPost()` utilities with automatic failover | All 26 direct `fetch(env.AXIOME_REST_URL + ...)` calls replaced with centralized utility that tries fallback URLs on 5xx/network errors. 5s timeout per attempt. | Revert commit (all calls revert to direct fetch) |
| `apps/api/src/config/env.ts` | Added `AXIOME_REST_URLS_FALLBACK` env var (default `''`) | Comma-separated list of backup REST URLs | Remove env var |
| `apps/api/src/routes/vault.ts` | Replaced 4 direct fetch calls with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/routes/bets.ts` | Replaced 2 direct fetch calls with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/routes/admin.ts` | Replaced 4 direct fetch calls with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/routes/auth.ts` | Replaced 2 direct fetch calls with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/services/treasury.service.ts` | Replaced 2 direct fetch calls with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/services/indexer.ts` | Replaced 4 direct fetch calls with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/services/relayer.ts` | Replaced 2 direct fetch calls with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/services/background-tasks.ts` | Replaced 5 direct fetch calls with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/services/treasury-sweep.service.ts` | Replaced 1 direct fetch call with `chainRest()` | Consistent failover | Revert commit |
| `apps/api/src/app.ts` | Replaced health check fetch with `chainRest()` | Consistent failover | Revert commit |
