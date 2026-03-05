use cosmwasm_std::{
    coins, BankMsg, CosmosMsg, DepsMut, Env, MessageInfo, Order, Response, Uint128,
};

use crate::error::ContractError;
use crate::state::{CONFIG, VAULT_BALANCES};

/// Admin-only: sweep orphaned native tokens from the contract.
/// Calculates: contract native balance - sum(all vault available + locked).
/// Sends the difference to `recipient` (defaults to admin).
pub fn execute_admin_sweep(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.admin {
        return Err(ContractError::Unauthorized);
    }

    // Query the native balance held by this contract
    let contract_balance = deps
        .querier
        .query_balance(&env.contract.address, &config.accepted_denom)?
        .amount;

    // Sum all vault balances (available + locked)
    let mut total_vault = Uint128::zero();
    for item in VAULT_BALANCES.range(deps.storage, None, None, Order::Ascending) {
        let (_, balance) = item?;
        total_vault += balance.available;
        total_vault += balance.locked;
    }

    // Orphaned = native balance on contract - total tracked in vaults
    let orphaned = contract_balance
        .checked_sub(total_vault)
        .unwrap_or(Uint128::zero());

    if orphaned.is_zero() {
        return Err(ContractError::NothingToSweep);
    }

    // Resolve recipient
    let to = match recipient {
        Some(addr) => deps.api.addr_validate(&addr)?,
        None => config.admin.clone(),
    };

    // Native token transfer
    let transfer_msg = CosmosMsg::Bank(BankMsg::Send {
        to_address: to.to_string(),
        amount: coins(orphaned.u128(), &config.accepted_denom),
    });

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "admin_sweep")
        .add_attribute("orphaned_amount", orphaned.to_string())
        .add_attribute("recipient", to.to_string())
        .add_attribute("contract_balance", contract_balance.to_string())
        .add_attribute("total_vault", total_vault.to_string()))
}
