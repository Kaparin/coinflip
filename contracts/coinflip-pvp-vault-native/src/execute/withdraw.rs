use cosmwasm_std::{coins, BankMsg, CosmosMsg, DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::state::{CONFIG, VAULT_BALANCES};

pub fn execute_withdraw(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let mut balance = VAULT_BALANCES
        .may_load(deps.storage, &info.sender)?
        .unwrap_or_default();

    if balance.available < amount {
        return Err(ContractError::InsufficientAvailableBalance {
            need: amount.to_string(),
            have: balance.available.to_string(),
        });
    }

    balance.available -= amount;
    VAULT_BALANCES.save(deps.storage, &info.sender, &balance)?;

    // Send native tokens back to user
    let transfer_msg = CosmosMsg::Bank(BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: coins(amount.u128(), &config.accepted_denom),
    });

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "withdraw")
        .add_attribute("user", info.sender.to_string())
        .add_attribute("amount", amount.to_string())
        .add_attribute("new_available", balance.available.to_string()))
}
