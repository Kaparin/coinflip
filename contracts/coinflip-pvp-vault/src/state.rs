use cosmwasm_std::{Addr, Binary, Uint128};
use cw_storage_plus::{Item, Map};
use cosmwasm_schema::cw_serde;

/// Default bet TTL: 12 hours = 43200 seconds.
/// Used by serde when loading old Config from storage that lacks this field.
pub fn default_bet_ttl_secs() -> u64 {
    43200
}

#[cw_serde]
pub struct Config {
    pub admin: Addr,
    pub token_cw20: Addr,
    pub treasury: Addr,
    pub commission_bps: u16,
    pub min_bet: Uint128,
    pub reveal_timeout_secs: u64,
    pub max_open_per_user: u16,
    pub max_daily_amount_per_user: Uint128,
    /// How long an open bet lives before it can be canceled by anyone (seconds).
    /// 0 = no expiration. Default: 43200 (12 hours).
    #[serde(default = "default_bet_ttl_secs")]
    pub bet_ttl_secs: u64,
}

#[cw_serde]
pub struct VaultBalance {
    pub available: Uint128,
    pub locked: Uint128,
}

impl Default for VaultBalance {
    fn default() -> Self {
        Self {
            available: Uint128::zero(),
            locked: Uint128::zero(),
        }
    }
}

#[cw_serde]
pub enum BetStatus {
    Open,
    Accepted,
    Revealed,
    Canceled,
    TimeoutClaimed,
}

#[cw_serde]
pub struct Bet {
    pub id: u64,
    pub maker: Addr,
    pub amount: Uint128,
    pub commitment: Binary,
    pub status: BetStatus,
    pub created_at_height: u64,
    pub created_at_time: u64,

    // Set on acceptance
    pub acceptor: Option<Addr>,
    pub acceptor_guess: Option<crate::msg::Side>,
    pub accepted_at_height: Option<u64>,
    pub accepted_at_time: Option<u64>,

    // Set on reveal/resolution
    pub reveal_secret: Option<Binary>,
    pub reveal_side: Option<crate::msg::Side>,
    pub resolved_at_height: Option<u64>,
    pub payout_winner: Option<Addr>,
    pub commission_paid: Uint128,
    pub payout_amount: Uint128,
}

// ---- Storage keys ----

pub const CONFIG: Item<Config> = Item::new("config");
pub const NEXT_BET_ID: Item<u64> = Item::new("next_bet_id");
pub const VAULT_BALANCES: Map<&Addr, VaultBalance> = Map::new("vault_balances");
pub const BETS: Map<u64, Bet> = Map::new("bets");
pub const USER_OPEN_BET_COUNT: Map<&Addr, u16> = Map::new("user_open_bet_count");

/// Daily usage tracking: (address, day_bucket) -> amount_used
pub const DAILY_USAGE: Map<(&Addr, u64), Uint128> = Map::new("daily_usage");

/// Pending admin for 2-step ownership transfer
pub const PENDING_ADMIN: Item<Addr> = Item::new("pending_admin");
