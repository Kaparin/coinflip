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

## Rules Reminder
- One PR = one goal, max 5-10 files
- Risky changes under feature flag (DEPOSIT_ASYNC_MODE, INDEXER_WS_MODE)
- No business logic / fairness changes
- No on-chain contract / key changes
- DB migrations: CREATE INDEX CONCURRENTLY only
- Migration first, then code
