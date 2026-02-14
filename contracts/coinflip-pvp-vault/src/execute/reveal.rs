use cosmwasm_std::{Binary, DepsMut, Env, MessageInfo, Response, Uint128};
use sha2::{Digest, Sha256};

use crate::error::ContractError;
use crate::msg::Side;
use crate::state::{BetStatus, BETS, CONFIG, USER_OPEN_BET_COUNT, VAULT_BALANCES};

pub fn execute_reveal(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    bet_id: u64,
    side: Side,
    secret: Binary,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let mut bet = BETS.load(deps.storage, bet_id).map_err(|_| ContractError::BetNotFound { id: bet_id })?;

    // Only ACCEPTED bets can be revealed
    if bet.status != BetStatus::Accepted {
        return Err(ContractError::InvalidStateTransition {
            action: "reveal".to_string(),
            current_status: format!("{:?}", bet.status),
        });
    }

    // Only maker can reveal
    if bet.maker != info.sender {
        return Err(ContractError::Unauthorized);
    }

    // Check timeout
    let accepted_at = bet.accepted_at_time.unwrap();
    let deadline = accepted_at + config.reveal_timeout_secs;
    if env.block.time.seconds() > deadline {
        return Err(ContractError::RevealTimeoutExpired { deadline });
    }

    // Verify commitment: SHA256("coinflip_v1" || maker_addr || side || secret)
    let side_bytes = match side {
        Side::Heads => b"heads".to_vec(),
        Side::Tails => b"tails".to_vec(),
    };

    let mut hasher = Sha256::new();
    hasher.update(b"coinflip_v1");
    hasher.update(bet.maker.as_bytes());
    hasher.update(&side_bytes);
    hasher.update(secret.as_slice());
    let computed_hash = hasher.finalize();
    let computed_commitment = Binary::from(computed_hash.to_vec());

    if computed_commitment != bet.commitment {
        return Err(ContractError::CommitmentMismatch);
    }

    // Determine winner
    let acceptor_guess = bet.acceptor_guess.clone().unwrap();
    let maker_wins = side != acceptor_guess;
    let winner = if maker_wins {
        bet.maker.clone()
    } else {
        bet.acceptor.clone().unwrap()
    };
    // Compute payouts
    let pot = bet.amount * Uint128::new(2);
    let commission = pot * Uint128::from(config.commission_bps) / Uint128::new(10_000);
    let payout = pot - commission;

    // Update balances: unlock both, credit winner, credit treasury
    let mut maker_bal = VAULT_BALANCES.load(deps.storage, &bet.maker)?;
    let mut acceptor_bal = VAULT_BALANCES.load(deps.storage, &bet.acceptor.clone().unwrap())?;

    maker_bal.locked -= bet.amount;
    acceptor_bal.locked -= bet.amount;

    if maker_wins {
        maker_bal.available += payout;
    } else {
        acceptor_bal.available += payout;
    }

    VAULT_BALANCES.save(deps.storage, &bet.maker, &maker_bal)?;
    VAULT_BALANCES.save(deps.storage, &bet.acceptor.clone().unwrap(), &acceptor_bal)?;

    // Credit treasury
    let mut treasury_bal = VAULT_BALANCES
        .may_load(deps.storage, &config.treasury)?
        .unwrap_or_default();
    treasury_bal.available += commission;
    VAULT_BALANCES.save(deps.storage, &config.treasury, &treasury_bal)?;

    // Decrement maker's open bet count
    let open_count = USER_OPEN_BET_COUNT
        .may_load(deps.storage, &bet.maker)?
        .unwrap_or(0);
    USER_OPEN_BET_COUNT.save(deps.storage, &bet.maker, &open_count.saturating_sub(1))?;

    // Update bet
    bet.status = BetStatus::Revealed;
    bet.reveal_secret = Some(secret);
    bet.reveal_side = Some(side.clone());
    bet.resolved_at_height = Some(env.block.height);
    bet.payout_winner = Some(winner.clone());
    bet.commission_paid = commission;
    bet.payout_amount = payout;
    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new()
        .add_attribute("action", "coinflip.bet_revealed")
        .add_attribute("bet_id", bet_id.to_string())
        .add_attribute("side", format!("{:?}", side))
        .add_attribute("winner", winner.to_string())
        .add_attribute("payout", payout.to_string())
        .add_attribute("action", "coinflip.commission_paid")
        .add_attribute("treasury", config.treasury.to_string())
        .add_attribute("commission", commission.to_string()))
}
