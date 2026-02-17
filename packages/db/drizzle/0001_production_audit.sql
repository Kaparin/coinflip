-- Migration: Production Audit Fixes
-- Date: 2026-02-17
-- Description: Adds unique constraints, composite indexes, and tx hash indexes
--              for production-grade performance and data integrity.

-- ─── Referral Rewards: unique constraint ─────────────────────────
-- Prevents duplicate rewards per (bet, recipient, level).
-- Safe to run on existing data — duplicates will cause failure.
-- If there ARE duplicates, deduplicate first:
--   DELETE FROM referral_rewards a USING referral_rewards b
--   WHERE a.id > b.id
--     AND a.bet_id = b.bet_id
--     AND a.recipient_user_id = b.recipient_user_id
--     AND a.level = b.level;

ALTER TABLE referral_rewards
  ADD CONSTRAINT ref_rewards_bet_recipient_level_uniq
  UNIQUE (bet_id, recipient_user_id, level);

-- ─── Bets: composite indexes ────────────────────────────────────
-- Used by: open bets list (status + created_time), user's bets, history
CREATE INDEX CONCURRENTLY IF NOT EXISTS bets_status_created_idx
  ON bets (status, created_time);

CREATE INDEX CONCURRENTLY IF NOT EXISTS bets_maker_status_idx
  ON bets (maker_user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS bets_acceptor_status_idx
  ON bets (acceptor_user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS bets_status_resolved_idx
  ON bets (status, resolved_time);

-- TX hash lookups (indexer resolves bets by txhash, background tasks too)
CREATE INDEX CONCURRENTLY IF NOT EXISTS bets_txhash_create_idx
  ON bets (txhash_create);

CREATE INDEX CONCURRENTLY IF NOT EXISTS bets_txhash_accept_idx
  ON bets (txhash_accept);

-- Commitment lookup (used by background-tasks fallback resolution)
CREATE INDEX CONCURRENTLY IF NOT EXISTS bets_commitment_idx
  ON bets (commitment);

-- ─── TX Events: composite index for deduplication ───────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS tx_events_txhash_type_idx
  ON tx_events (txhash, event_type);
