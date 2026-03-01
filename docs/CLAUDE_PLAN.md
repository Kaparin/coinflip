# Performance Fix Plan

**Baseline tag:** `baseline-pre-perf-fix` (commit `caf96ba`)
**Started:** 2026-03-01

---

## Status Summary

| PR | Scope | Status | Branch |
|----|-------|--------|--------|
| PR-1 | DB indexes + query caches | MERGED | `perf/db-indexes-and-caches` |
| PR-2 | Frontend render perf | MERGED | `perf/frontend-render` |
| PR-3 | Async deposit 202 | MERGED | `perf/async-deposit-202` |
| PR-4 | Balance dedup + WS cleanup | MERGED | `perf/balance-dedup-ws-cleanup` |
| PR-5 | RPC failover | MERGED | `perf/rpc-failover` |
| PR-6 | CometBFT WS indexer | MERGED | `perf/cometbft-ws-indexer` |

**All 6 PRs complete and merged to main.**

---

## Feature Flags

| Flag | Default | Effect |
|------|---------|--------|
| `DEPOSIT_ASYNC_MODE` | `false` | When `true`, deposit returns 202 immediately, confirms via WS |
| `INDEXER_WS_MODE` | `false` | When `true`, uses CometBFT WebSocket for real-time indexing |
| `AXIOME_REST_URLS_FALLBACK` | `''` | Comma-separated backup REST URLs for failover |

---

## Rules Reminder
- One PR = one goal, max 5-10 files
- Risky changes under feature flag (DEPOSIT_ASYNC_MODE, INDEXER_WS_MODE)
- No business logic / fairness changes
- No on-chain contract / key changes
- DB migrations: CREATE INDEX CONCURRENTLY only
- Migration first, then code
