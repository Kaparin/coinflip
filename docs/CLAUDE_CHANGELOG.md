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

_(entries will be added as changes are made)_
