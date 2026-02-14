use cosmwasm_std::{Deps, Order, StdResult};

use crate::msg::{BetResponse, BetsResponse, ConfigResponse, VaultBalanceResponse};
use crate::state::{BetStatus, BETS, CONFIG, VAULT_BALANCES};

pub fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        admin: config.admin,
        token_cw20: config.token_cw20,
        treasury: config.treasury,
        commission_bps: config.commission_bps,
        min_bet: config.min_bet,
        reveal_timeout_secs: config.reveal_timeout_secs,
        max_open_per_user: config.max_open_per_user,
        max_daily_amount_per_user: config.max_daily_amount_per_user,
    })
}

pub fn query_vault_balance(deps: Deps, address: String) -> StdResult<VaultBalanceResponse> {
    let addr = deps.api.addr_validate(&address)?;
    let balance = VAULT_BALANCES
        .may_load(deps.storage, &addr)?
        .unwrap_or_default();
    Ok(VaultBalanceResponse {
        available: balance.available,
        locked: balance.locked,
    })
}

pub fn query_bet(deps: Deps, bet_id: u64) -> StdResult<BetResponse> {
    let bet = BETS.load(deps.storage, bet_id)?;
    Ok(bet_to_response(bet))
}

pub fn query_open_bets(
    deps: Deps,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<BetsResponse> {
    let limit = limit.unwrap_or(20).min(100) as usize;
    let start = start_after.map(|s| s + 1).unwrap_or(0);

    let bets: Vec<BetResponse> = BETS
        .range(deps.storage, Some(cw_storage_plus::Bound::inclusive(start)), None, Order::Ascending)
        .filter_map(|item| {
            let (_, bet) = item.ok()?;
            if bet.status == BetStatus::Open {
                Some(bet_to_response(bet))
            } else {
                None
            }
        })
        .take(limit)
        .collect();

    Ok(BetsResponse { bets })
}

pub fn query_user_bets(
    deps: Deps,
    address: String,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<BetsResponse> {
    let addr = deps.api.addr_validate(&address)?;
    let limit = limit.unwrap_or(20).min(100) as usize;
    let start = start_after.map(|s| s + 1).unwrap_or(0);

    let bets: Vec<BetResponse> = BETS
        .range(deps.storage, Some(cw_storage_plus::Bound::inclusive(start)), None, Order::Ascending)
        .filter_map(|item| {
            let (_, bet) = item.ok()?;
            if bet.maker == addr || bet.acceptor.as_ref() == Some(&addr) {
                Some(bet_to_response(bet))
            } else {
                None
            }
        })
        .take(limit)
        .collect();

    Ok(BetsResponse { bets })
}

fn bet_to_response(bet: crate::state::Bet) -> BetResponse {
    BetResponse {
        id: bet.id,
        maker: bet.maker,
        amount: bet.amount,
        commitment: bet.commitment,
        status: format!("{:?}", bet.status).to_lowercase(),
        acceptor: bet.acceptor,
        acceptor_guess: bet.acceptor_guess,
        created_at_time: bet.created_at_time,
        accepted_at_time: bet.accepted_at_time,
        reveal_side: bet.reveal_side,
        winner: bet.payout_winner,
        payout_amount: if bet.payout_amount.is_zero() {
            None
        } else {
            Some(bet.payout_amount)
        },
        commission_paid: if bet.commission_paid.is_zero() {
            None
        } else {
            Some(bet.commission_paid)
        },
    }
}
