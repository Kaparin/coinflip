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
| `apps/web/src/components/features/bets/bet-card.tsx` | Wrapped component with `React.memo()` | Prevents re-render of all 50 bet cards when any parent state changes | Revert commit |
| `apps/web/src/hooks/use-websocket.ts` | Removed `setLastEvent` state update | `lastEvent` was set but never read — caused unnecessary re-renders on every WS message | Revert commit |
| `apps/web/src/components/features/bets/my-bets.tsx` | Added `useMemo` on `myResolved` filter | `filter()` ran every render, creating new array reference | Revert commit |
| `apps/web/src/app/game/page.tsx` | Added `visitedTabs` state for lazy-mount tabs | Hidden tabs were mounted and polling even when never visited | Revert commit |

---

## PR-3: Async Deposit 202

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/config/env.ts` | Added `DEPOSIT_ASYNC_MODE` env var (default `'false'`) | Feature flag for async deposit | Set `'false'` or remove |
| `packages/shared/src/types/index.ts` | Added `deposit_confirmed` / `deposit_failed` to `WsEventType` | New WS events for async notification | Revert commit |
| `apps/api/src/routes/vault.ts` | Extracted `pollTxConfirmation()`, added async 202 path | Returns 202 immediately, background poll + WS notification | Set `DEPOSIT_ASYNC_MODE=false` |
| `apps/web/src/hooks/use-websocket.ts` | Added deposit event handlers | Balance cache invalidation on deposit confirm/fail | Revert commit |
| `apps/web/src/app/game/page.tsx` | Added toast notifications for deposit events | User feedback for async deposits | Revert commit |
| `apps/web/src/lib/i18n/en.json` | Added `depositConfirmedWs`, `depositFailedWs` keys | i18n | Revert commit |
| `apps/web/src/lib/i18n/ru.json` | Added `depositConfirmedWs`, `depositFailedWs` keys | i18n | Revert commit |

---

## PR-4: Balance Dedup + WS Cleanup

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/routes/vault.ts` | Chain cache TTL `10_000` → `30_000` | Reduces redundant chain queries; WS invalidates cache anyway | Change back to `10_000` |
| `apps/web/src/components/features/vault/balance-display.tsx` | WS-aware refetchInterval (60s connected, 10s disconnected) | 4x less polling when WS active | Revert to `15_000` |
| `apps/web/src/hooks/use-wallet-balance.ts` | Same WS-aware refetchInterval | Same reasoning | Revert to `15_000` |

---

## PR-5: RPC Failover

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/lib/chain-fetch.ts` | **NEW** — `chainRest()` / `chainRestPost()` with failover | Centralized utility, tries backup URLs on 5xx/network errors | Revert commit |
| `apps/api/src/config/env.ts` | Added `AXIOME_REST_URLS_FALLBACK` env var | Comma-separated backup REST URLs | Remove env var |
| 10 files | Replaced 26 direct `fetch(env.AXIOME_REST_URL + ...)` with `chainRest()` | Consistent failover across all chain REST calls | Revert commit |

---

## PR-6: CometBFT WS Indexer

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/lib/chain-ws.ts` | **NEW** — `ChainWebSocketClient` class + `rpcUrlToWsUrl()` helper | CometBFT WS client with JSON-RPC subscribe, auto-reconnect with exponential backoff, base64 attribute decoding for older CometBFT versions | Revert commit |
| `apps/api/src/config/env.ts` | Added `INDEXER_WS_MODE` env var (default `'false'`) | Feature flag — when `'true'`, indexer uses WS for real-time events instead of 3s polling | Set `'false'` or remove |
| `apps/api/src/services/indexer.ts` | Added WS mode: `startWsMode()`, `onChainWsEvent()`, `extractCoinFlipEventsFromWs()`. Modified `start()` to check `INDEXER_WS_MODE`. Modified `stop()`/`disconnect()` to clean up WS. Added `wsMode`/`wsConnected` to `getStatus()`. | Real-time event processing (<1s vs 3s polling). Polling auto-resumes on WS disconnect; missed blocks backfilled on reconnect. All event handling logic (`handleEvent`, `syncBetFromEvent`) unchanged — WS events are converted to same `CoinFlipEvent` format. | Set `INDEXER_WS_MODE=false` |
