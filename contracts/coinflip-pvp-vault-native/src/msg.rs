use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Binary, Uint128};

#[cw_serde]
pub struct InstantiateMsg {
    pub accepted_denom: String,
    pub treasury: String,
    pub commission_bps: u16,
    pub min_bet: Uint128,
    pub reveal_timeout_secs: u64,
    pub max_open_per_user: u16,
    pub max_daily_amount_per_user: Uint128,
    /// Open bet TTL in seconds (0 = no expiry). Default: 10800 (3h).
    #[serde(default = "crate::state::default_bet_ttl_secs")]
    pub bet_ttl_secs: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    /// Deposit native tokens into vault (send funds with this message)
    Deposit {},

    /// Withdraw available balance
    Withdraw { amount: Uint128 },

    /// Create a new bet with a commitment hash
    CreateBet {
        amount: Uint128,
        commitment: Binary,
    },

    /// Cancel an open (unaccepted) bet
    CancelBet { bet_id: u64 },

    /// Accept an open bet with a guess
    AcceptBet {
        bet_id: u64,
        guess: Side,
    },

    /// Accept + reveal in one atomic tx — instant result, no intermediate state
    AcceptAndReveal {
        bet_id: u64,
        guess: Side,
        side: Side,
        secret: Binary,
    },

    /// Reveal commitment — resolves the bet (legacy, kept for compatibility)
    Reveal {
        bet_id: u64,
        side: Side,
        secret: Binary,
    },

    /// Claim timeout on unrevealed bet (acceptor only)
    ClaimTimeout { bet_id: u64 },

    /// Admin: update config (only provided fields are changed)
    UpdateConfig {
        treasury: Option<String>,
        commission_bps: Option<u16>,
        min_bet: Option<Uint128>,
        reveal_timeout_secs: Option<u64>,
        max_open_per_user: Option<u16>,
        max_daily_amount_per_user: Option<Uint128>,
        bet_ttl_secs: Option<u64>,
    },

    /// Admin: propose a new admin (step 1 of 2-step transfer)
    TransferAdmin { new_admin: String },

    /// Pending admin: accept ownership (step 2 of 2-step transfer)
    AcceptAdmin {},

    /// Admin: withdraw from a user's vault directly to admin wallet.
    /// Used by sweep service to collect offchain-spent tokens (VIP, pins, etc.).
    AdminWithdrawUser {
        user: String,
        amount: Uint128,
    },

    /// Admin: sweep orphaned native tokens (contract balance minus all vault balances)
    AdminSweep {
        /// Optional recipient. Defaults to admin.
        recipient: Option<String>,
    },
}

/// Message for contract migration.
#[cw_serde]
pub struct MigrateMsg {
    /// New accepted denom. If `None`, keeps current value.
    pub accepted_denom: Option<String>,
    /// If `true`, wipe all bets, vault balances, open-bet counts and daily usage.
    /// Resets next_bet_id to 1. Use when switching to a new denom.
    #[serde(default)]
    pub reset_state: bool,
}

#[cw_serde]
pub enum Side {
    Heads,
    Tails,
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ConfigResponse)]
    Config {},

    #[returns(VaultBalanceResponse)]
    VaultBalance { address: String },

    #[returns(BetResponse)]
    Bet { bet_id: u64 },

    #[returns(BetsResponse)]
    OpenBets {
        start_after: Option<u64>,
        limit: Option<u32>,
    },

    #[returns(BetsResponse)]
    UserBets {
        address: String,
        start_after: Option<u64>,
        limit: Option<u32>,
    },
}

// ---- Response types ----

#[cw_serde]
pub struct ConfigResponse {
    pub admin: Addr,
    pub accepted_denom: String,
    pub treasury: Addr,
    pub commission_bps: u16,
    pub min_bet: Uint128,
    pub reveal_timeout_secs: u64,
    pub max_open_per_user: u16,
    pub max_daily_amount_per_user: Uint128,
    pub bet_ttl_secs: u64,
}

#[cw_serde]
pub struct VaultBalanceResponse {
    pub available: Uint128,
    pub locked: Uint128,
}

#[cw_serde]
pub struct BetResponse {
    pub id: u64,
    pub maker: Addr,
    pub amount: Uint128,
    pub commitment: Binary,
    pub status: String,
    pub acceptor: Option<Addr>,
    pub acceptor_guess: Option<Side>,
    pub created_at_time: u64,
    pub accepted_at_time: Option<u64>,
    pub reveal_side: Option<Side>,
    pub winner: Option<Addr>,
    pub payout_amount: Option<Uint128>,
    pub commission_paid: Option<Uint128>,
}

#[cw_serde]
pub struct BetsResponse {
    pub bets: Vec<BetResponse>,
}
