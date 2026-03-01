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

### React.memo on BetCard

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/web/src/components/features/bets/bet-card.tsx` | Wrapped component export with `memo()`. Changed `export function BetCard` → `export const BetCard = memo(function BetCard`. Added `memo` to imports. | Each BetCard has its own countdown timer that ticks every second. Without memo, a parent re-render (e.g., from WS events) re-renders ALL 50+ cards even when their props haven't changed. With memo, only cards with changed props re-render. | Revert commit |

### Remove setLastEvent from useWebSocket

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/web/src/hooks/use-websocket.ts` | Removed `useState<WsEvent \| null>` for lastEvent. Removed `setLastEvent(parsed)` call. Return `lastEvent: null` hardcoded to keep interface stable. | Every WS message triggered `setLastEvent()` → React state update → re-render of GamePage + all children. `lastEvent` was never consumed by any component. Removing it eliminates N re-renders per second from WS traffic. | Revert commit |

### Memoize MyBets filter results

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/web/src/components/features/bets/my-bets.tsx` | Wrapped `myOpenBets`, `myAccepting`, `myInProgress`, `myResolved` filter computations with `useMemo()`. Added `useMemo` to imports. | Filter results created new array references on every render, causing child components to re-render even when data hadn't changed. `useMemo` ensures stable references when `myBets` array hasn't changed. | Revert commit |

### Lazy-mount hidden tabs

| File | Change | Why | Rollback |
|------|--------|-----|----------|
| `apps/web/src/app/game/page.tsx` | Added `visitedTabs` state (Set). Tabs mount on first visit, stay mounted (preserving scroll). BetList always mounted. MyBets/HistoryList/Leaderboard mount lazily. | Previously all 4 tabs mounted on page load, each firing their own API queries and running timers even when hidden. Lazy-mount means only visited tabs consume resources. Once visited, they stay mounted to preserve scroll position. | Revert commit |
