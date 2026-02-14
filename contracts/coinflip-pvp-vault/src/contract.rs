use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response,
    StdResult,
};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{Config, CONFIG, NEXT_BET_ID};

const CONTRACT_NAME: &str = "crates.io:coinflip-pvp-vault";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let config = Config {
        admin: info.sender,
        token_cw20: deps.api.addr_validate(&msg.token_cw20)?,
        treasury: deps.api.addr_validate(&msg.treasury)?,
        commission_bps: msg.commission_bps,
        min_bet: msg.min_bet,
        reveal_timeout_secs: msg.reveal_timeout_secs,
        max_open_per_user: msg.max_open_per_user,
        max_daily_amount_per_user: msg.max_daily_amount_per_user,
    };

    CONFIG.save(deps.storage, &config)?;
    NEXT_BET_ID.save(deps.storage, &1u64)?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("admin", config.admin.to_string())
        .add_attribute("token_cw20", config.token_cw20.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Receive(cw20_msg) => {
            crate::execute::deposit::execute_receive(deps, env, info, cw20_msg)
        }
        ExecuteMsg::Withdraw { amount } => {
            crate::execute::withdraw::execute_withdraw(deps, env, info, amount)
        }
        ExecuteMsg::CreateBet { amount, commitment } => {
            crate::execute::create_bet::execute_create_bet(deps, env, info, amount, commitment)
        }
        ExecuteMsg::CancelBet { bet_id } => {
            crate::execute::cancel_bet::execute_cancel_bet(deps, env, info, bet_id)
        }
        ExecuteMsg::AcceptBet { bet_id, guess } => {
            crate::execute::accept_bet::execute_accept_bet(deps, env, info, bet_id, guess)
        }
        ExecuteMsg::Reveal { bet_id, side, secret } => {
            crate::execute::reveal::execute_reveal(deps, env, info, bet_id, side, secret)
        }
        ExecuteMsg::ClaimTimeout { bet_id } => {
            crate::execute::claim_timeout::execute_claim_timeout(deps, env, info, bet_id)
        }
        ExecuteMsg::UpdateConfig { .. } => {
            // TODO: implement admin config update
            Err(ContractError::Unauthorized)
        }
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&crate::query::query_config(deps)?),
        QueryMsg::VaultBalance { address } => {
            to_json_binary(&crate::query::query_vault_balance(deps, address)?)
        }
        QueryMsg::Bet { bet_id } => to_json_binary(&crate::query::query_bet(deps, bet_id)?),
        QueryMsg::OpenBets { start_after, limit } => {
            to_json_binary(&crate::query::query_open_bets(deps, start_after, limit)?)
        }
        QueryMsg::UserBets {
            address,
            start_after,
            limit,
        } => to_json_binary(&crate::query::query_user_bets(
            deps,
            address,
            start_after,
            limit,
        )?),
    }
}
