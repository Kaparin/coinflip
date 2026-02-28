use cosmwasm_std::{
    to_json_binary, CosmosMsg, DepsMut, Env, MessageInfo, Order, Response, Uint128, WasmMsg,
};
use cw20::{BalanceResponse, Cw20ExecuteMsg, Cw20QueryMsg};

use crate::error::ContractError;
use crate::state::{CONFIG, VAULT_BALANCES};

/// Admin-only: sweep orphaned CW20 tokens from the contract.
/// Calculates: contract CW20 balance - sum(all vault available + locked).
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

    // Query the CW20 balance held by this contract
    let cw20_balance: BalanceResponse = deps.querier.query_wasm_smart(
        config.token_cw20.to_string(),
        &Cw20QueryMsg::Balance {
            address: env.contract.address.to_string(),
        },
    )?;

    // Sum all vault balances (available + locked)
    let mut total_vault = Uint128::zero();
    for item in VAULT_BALANCES.range(deps.storage, None, None, Order::Ascending) {
        let (_, balance) = item?;
        total_vault += balance.available;
        total_vault += balance.locked;
    }

    // Orphaned = CW20 balance on contract - total tracked in vaults
    let orphaned = cw20_balance
        .balance
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

    // CW20 transfer
    let transfer_msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.token_cw20.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
            recipient: to.to_string(),
            amount: orphaned,
        })?,
        funds: vec![],
    });

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "admin_sweep")
        .add_attribute("orphaned_amount", orphaned.to_string())
        .add_attribute("recipient", to.to_string())
        .add_attribute("contract_balance", cw20_balance.balance.to_string())
        .add_attribute("total_vault", total_vault.to_string()))
}
