use cosmwasm_std::{coins, BankMsg, CosmosMsg, DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::state::{CONFIG, VAULT_BALANCES};

/// Admin-only: withdraw from a user's vault directly to the treasury wallet.
/// Used by the sweep service to collect offchain-spent tokens (VIP, pins, etc.)
/// without routing through the user's bank account.
pub fn execute_admin_withdraw_user(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    user: String,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Only contract admin can call this
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    let user_addr = deps.api.addr_validate(&user)?;
    let mut balance = VAULT_BALANCES
        .may_load(deps.storage, &user_addr)?
        .unwrap_or_default();

    if balance.available < amount {
        return Err(ContractError::InsufficientAvailableBalance {
            need: amount.to_string(),
            have: balance.available.to_string(),
        });
    }

    balance.available -= amount;
    VAULT_BALANCES.save(deps.storage, &user_addr, &balance)?;

    // Send native tokens directly to admin (sender)
    let transfer_msg = CosmosMsg::Bank(BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: coins(amount.u128(), &config.accepted_denom),
    });

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "admin_withdraw_user")
        .add_attribute("user", user_addr.to_string())
        .add_attribute("amount", amount.to_string())
        .add_attribute("recipient", info.sender.to_string())
        .add_attribute("new_available", balance.available.to_string()))
}
