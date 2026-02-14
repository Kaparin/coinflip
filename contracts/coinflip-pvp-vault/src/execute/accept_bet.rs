use cosmwasm_std::{DepsMut, Env, MessageInfo, Response};

use crate::error::ContractError;
use crate::msg::Side;
use crate::state::{BetStatus, BETS, VAULT_BALANCES};

pub fn execute_accept_bet(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    bet_id: u64,
    guess: Side,
) -> Result<Response, ContractError> {
    let mut bet = BETS.load(deps.storage, bet_id).map_err(|_| ContractError::BetNotFound { id: bet_id })?;

    // Only OPEN bets can be accepted
    if bet.status != BetStatus::Open {
        return Err(ContractError::InvalidStateTransition {
            action: "accept".to_string(),
            current_status: format!("{:?}", bet.status),
        });
    }

    // No self-accept
    if bet.maker == info.sender {
        return Err(ContractError::SelfAcceptNotAllowed);
    }

    // Check acceptor balance
    let mut balance = VAULT_BALANCES
        .may_load(deps.storage, &info.sender)?
        .unwrap_or_default();
    if balance.available < bet.amount {
        return Err(ContractError::InsufficientAvailableBalance {
            need: bet.amount.to_string(),
            have: balance.available.to_string(),
        });
    }

    // Lock acceptor funds
    balance.available -= bet.amount;
    balance.locked += bet.amount;
    VAULT_BALANCES.save(deps.storage, &info.sender, &balance)?;

    // Update bet
    bet.status = BetStatus::Accepted;
    bet.acceptor = Some(info.sender.clone());
    bet.acceptor_guess = Some(guess.clone());
    bet.accepted_at_height = Some(env.block.height);
    bet.accepted_at_time = Some(env.block.time.seconds());
    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new()
        .add_attribute("action", "coinflip.bet_accepted")
        .add_attribute("bet_id", bet_id.to_string())
        .add_attribute("acceptor", info.sender.to_string())
        .add_attribute("guess", format!("{:?}", guess)))
}
