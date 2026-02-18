-- Migration: Integrity constraints, indexes, deduplication
-- Date: 2026-02-18
-- Phase 1 Step 1.2: Production hardening

-- ─── Vault Balances: non-negative constraints ─────────────────
ALTER TABLE vault_balances
  ADD CONSTRAINT vault_available_nonneg CHECK (available::numeric >= 0);

ALTER TABLE vault_balances
  ADD CONSTRAINT vault_locked_nonneg CHECK (locked::numeric >= 0);

-- ─── TX Events: unique constraint for deduplication ───────────
-- Prevents double-processing of the same event (race between indexer + sweep)
-- Safe: if duplicates exist, this will fail. Deduplicate first:
--   DELETE FROM tx_events a USING tx_events b
--   WHERE a.id > b.id AND a.txhash = b.txhash AND a.event_type = b.event_type;
ALTER TABLE tx_events
  ADD CONSTRAINT tx_events_txhash_type_uniq UNIQUE (txhash, event_type);

-- ─── Treasury Ledger: unique + index ──────────────────────────
-- Prevents double commission recording
ALTER TABLE treasury_ledger
  ADD CONSTRAINT treasury_ledger_txhash_source_uniq UNIQUE (txhash, source);

CREATE INDEX CONCURRENTLY IF NOT EXISTS treasury_ledger_created_idx
  ON treasury_ledger (created_at DESC);

-- ─── Sessions: index on user_id ───────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_user_id_idx
  ON sessions (user_id);

-- ─── Bets: status CHECK constraint ────────────────────────────
ALTER TABLE bets
  ADD CONSTRAINT bets_status_check CHECK (
    status IN ('open', 'accepting', 'accepted', 'canceling', 'canceled', 'revealed', 'timeout_claimed', 'creating')
  );
