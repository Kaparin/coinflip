use cosmwasm_std::{Addr, Uint128};
use cosmwasm_schema::cw_serde;
use cw_storage_plus::Item;

#[cw_serde]
pub struct Config {
    pub admin: Addr,
    /// CW20 token contract address (COIN)
    pub coin_cw20: Addr,
    /// Rate: buyer gets (axm_amount * rate_num / rate_denom) micro-COIN per uaxm.
    /// At 1:1 → rate_num=1, rate_denom=1 (1 uaxm = 1 micro-COIN, i.e. 1 AXM = 1 COIN).
    pub rate_num: u64,
    pub rate_denom: u64,
    /// Whether presale is active (accepting purchases)
    pub enabled: bool,
    /// Max uaxm per single transaction (0 = no limit)
    pub max_per_tx: Uint128,
    /// Total uaxm received across all purchases
    pub total_axm_received: Uint128,
    /// Total micro-COIN sold across all purchases
    pub total_coin_sold: Uint128,
}

pub const CONFIG: Item<Config> = Item::new("config");
