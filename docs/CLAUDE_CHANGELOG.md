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
| `apps/web/src/components/features/bets/bet-card.tsx` | Wrapped with `React.memo()` | Prevents cascade re-renders from parent WS events. Each card has own timer; memo ensures only cards with changed props re-render. | Revert commit |
| `apps/web/src/hooks/use-websocket.ts` | Removed `setLastEvent` state, return `lastEvent: null` hardcoded | Every WS message triggered state update → re-render of GamePage + all children. `lastEvent` was never consumed. | Revert commit |
| `apps/web/src/components/features/bets/my-bets.tsx` | `useMemo` on filter results (`myOpenBets`, `myAccepting`, `myInProgress`, `myResolved`) | New array refs on every render → child re-renders even when data unchanged. | Revert commit |
| `apps/web/src/app/game/page.tsx` | `visitedTabs` state + lazy-mount pattern for MyBets/History/Leaderboard | All 4 tabs mounted on load, firing API queries + timers when hidden. Now mount on first visit, stay mounted for scroll. | Revert commit |

---

## PR-3: Async Deposit 202

### Feature Flag

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/config/env.ts` | Added `DEPOSIT_ASYNC_MODE` env var (default `'false'`) | Controls whether deposit endpoint returns 202 (async) or blocks for confirmation (sync). Safe rollback: just set to `false`. | Remove env var or set to `false` |

### Backend Route

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/api/src/routes/vault.ts` | Extracted `pollTxConfirmation()` helper. When `DEPOSIT_ASYNC_MODE=true`: release inflight guard, spawn background poll, return 202 immediately. Background poll emits `deposit_confirmed`/`deposit_failed` + `balance_updated` via WS. Sync path unchanged. | Deposit endpoint blocked for 5-30s waiting for chain confirmation. Async mode returns in ~2s. | Set `DEPOSIT_ASYNC_MODE=false` or revert commit |

### Shared Types

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `packages/shared/src/types/index.ts` | Added `deposit_confirmed` and `deposit_failed` to `WsEventType` union | New WS events for async deposit notification | Revert commit |

### Frontend

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/web/src/hooks/use-websocket.ts` | Added `deposit_confirmed` / `deposit_failed` cases to switch — invalidate balance queries | Frontend needs to refetch balance when async deposit confirms or fails | Revert commit |
| `apps/web/src/app/game/page.tsx` | Added toast notifications for `deposit_confirmed` and `deposit_failed` events | User needs visual feedback when async deposit completes | Revert commit |
| `apps/web/src/lib/i18n/en.json` | Added `depositConfirmedWs` and `depositFailedWs` keys | i18n for new toast messages | Revert commit |
| `apps/web/src/lib/i18n/ru.json` | Added `depositConfirmedWs` and `depositFailedWs` keys | i18n for new toast messages | Revert commit |
