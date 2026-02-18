-- Migration: Add pending_bet_secrets table
-- Date: 2026-02-17
-- Description: Persistent storage for bet secrets between chain broadcast and DB confirmation.
--              Prevents secret loss when background tasks fail to resolve bet_id.
--              Enables the reconciliation sweep to recover secrets for orphaned bets.

CREATE TABLE IF NOT EXISTS pending_bet_secrets (
  commitment TEXT PRIMARY KEY,
  maker_side TEXT NOT NULL,
  maker_secret TEXT NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
