use cosmwasm_std::{DepsMut, Env, MessageInfo, Response};

use crate::error::ContractError;
use crate::state::{BetStatus, BETS, USER_OPEN_BET_COUNT, VAULT_BALANCES};

pub fn execute_cancel_bet(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    bet_id: u64,
) -> Result<Response, ContractError> {
    let mut bet = BETS.load(deps.storage, bet_id).map_err(|_| ContractError::BetNotFound { id: bet_id })?;

    // Only OPEN bets can be canceled
    if bet.status != BetStatus::Open {
        return Err(ContractError::InvalidStateTransition {
            action: "cancel".to_string(),
            current_status: format!("{:?}", bet.status),
        });
    }

    // Only maker can cancel
    if bet.maker != info.sender {
        return Err(ContractError::Unauthorized);
    }

    // Unlock funds
    let mut balance = VAULT_BALANCES.load(deps.storage, &info.sender)?;
    balance.locked -= bet.amount;
    balance.available += bet.amount;
    VAULT_BALANCES.save(deps.storage, &info.sender, &balance)?;

    // Decrement open bets count
    let open_count = USER_OPEN_BET_COUNT.load(deps.storage, &info.sender)?;
    USER_OPEN_BET_COUNT.save(deps.storage, &info.sender, &open_count.saturating_sub(1))?;

    // Update bet status
    bet.status = BetStatus::Canceled;
    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new()
        .add_attribute("action", "coinflip.bet_canceled")
        .add_attribute("bet_id", bet_id.to_string()))
}
