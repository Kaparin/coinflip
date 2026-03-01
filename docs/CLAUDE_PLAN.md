# Performance Fix Plan

**Baseline tag:** `baseline-pre-perf-fix` (commit `caf96ba`)
**Started:** 2026-03-01

---

## Status Summary

| PR | Scope | Status | Branch |
|----|-------|--------|--------|
| PR-1 | DB indexes + query caches | IN PROGRESS | `perf/db-indexes-and-caches` |
| PR-2 | Frontend render perf | PENDING | `perf/frontend-render` |
| PR-3 | Async deposit 202 | PENDING | — |
| PR-4 | Balance dedup + WS cleanup | PENDING | — |
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
- [ ] `pnpm --filter @coinflip/api typecheck` passes
- [ ] Indexes visible in Neon dashboard

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
- `apps/web/src/hooks/use-websocket.ts` — remove setLastEvent
- `apps/web/src/components/features/bets/my-bets.tsx` — memoize myResolved filter
- `apps/web/src/app/game/page.tsx` — lazy-mount hidden tabs

### Verification Checklist
- [ ] Game page with 50 bets: no visual freezing
- [ ] Tab switching: content appears instantly, scroll positions OK
- [ ] Bet cards: countdowns tick correctly, accept/cancel buttons work
- [ ] MyBets: resolved bets fade out correctly
- [ ] WS events: bets appear/update/disappear in real time
- [ ] No console errors
- [ ] `pnpm --filter @coinflip/web typecheck` passes
- [ ] Mobile: pull-to-refresh still works

### Expected Effect
- Re-renders per second: ~100 (50 timers) → ~50 (still per-card, but memo prevents cascade)
- Hidden tabs stop polling → -75% background API requests
- Measurement: React DevTools Profiler, Network tab request count

---

## Rules Reminder
- One PR = one goal, max 5-10 files
- Risky changes under feature flag (DEPOSIT_ASYNC_MODE, INDEXER_WS_MODE)
- No business logic / fairness changes
- No on-chain contract / key changes
- DB migrations: CREATE INDEX CONCURRENTLY only
- Migration first, then code
