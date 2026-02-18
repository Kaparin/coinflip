use cosmwasm_std::{Binary, DepsMut, Env, MessageInfo, Response, Uint128};
use sha2::{Digest, Sha256};

use crate::error::ContractError;
use crate::msg::Side;
use crate::state::{BetStatus, BETS, CONFIG, USER_OPEN_BET_COUNT, VAULT_BALANCES};

/// Accept a bet AND reveal the maker's secret in a single atomic transaction.
///
/// This eliminates the "accepted" intermediate state entirely:
///   Open → Revealed (one tx, instant result)
///
/// The caller (info.sender) is the acceptor.
/// The maker's secret is verified via commitment — no sender == maker check needed
/// because SHA256(secret) == commitment IS the authorization proof.
pub fn execute_accept_and_reveal(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    bet_id: u64,
    guess: Side,
    side: Side,
    secret: Binary,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let mut bet = BETS
        .load(deps.storage, bet_id)
        .map_err(|_| ContractError::BetNotFound { id: bet_id })?;

    // ─── Accept checks ───────────────────────────────────────────

    // Only OPEN bets can be accepted
    if bet.status != BetStatus::Open {
        return Err(ContractError::InvalidStateTransition {
            action: "accept_and_reveal".to_string(),
            current_status: format!("{:?}", bet.status),
        });
    }

    // Reject expired bets
    if config.bet_ttl_secs > 0 {
        let expires_at = bet.created_at_time + config.bet_ttl_secs;
        if env.block.time.seconds() > expires_at {
            return Err(ContractError::BetExpired {
                id: bet_id,
                expired_at: expires_at,
            });
        }
    }

    // No self-accept
    if bet.maker == info.sender {
        return Err(ContractError::SelfAcceptNotAllowed);
    }

    // Check acceptor balance
    let mut acceptor_bal = VAULT_BALANCES
        .may_load(deps.storage, &info.sender)?
        .unwrap_or_default();
    if acceptor_bal.available < bet.amount {
        return Err(ContractError::InsufficientAvailableBalance {
            need: bet.amount.to_string(),
            have: acceptor_bal.available.to_string(),
        });
    }

    // ─── Reveal checks ──────────────────────────────────────────

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

    // ─── Determine winner ────────────────────────────────────────

    let maker_wins = side != guess;
    let winner = if maker_wins {
        bet.maker.clone()
    } else {
        info.sender.clone()
    };

    // ─── Compute payouts ─────────────────────────────────────────

    let pot = bet.amount * Uint128::new(2);
    let commission = pot * Uint128::from(config.commission_bps) / Uint128::new(10_000);
    let payout = pot - commission;

    // ─── Update balances ─────────────────────────────────────────

    // Lock acceptor funds, then unlock both + credit winner
    acceptor_bal.available -= bet.amount;
    // acceptor_bal.locked stays the same (lock and unlock cancel out atomically)

    let mut maker_bal = VAULT_BALANCES.load(deps.storage, &bet.maker)?;
    maker_bal.locked -= bet.amount;

    if maker_wins {
        maker_bal.available += payout;
    } else {
        acceptor_bal.available += payout;
    }

    VAULT_BALANCES.save(deps.storage, &bet.maker, &maker_bal)?;
    VAULT_BALANCES.save(deps.storage, &info.sender, &acceptor_bal)?;

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

    // ─── Update bet state (Open → Revealed, skip Accepted) ──────

    bet.status = BetStatus::Revealed;
    bet.acceptor = Some(info.sender.clone());
    bet.acceptor_guess = Some(guess.clone());
    bet.accepted_at_height = Some(env.block.height);
    bet.accepted_at_time = Some(env.block.time.seconds());
    bet.reveal_secret = Some(secret);
    bet.reveal_side = Some(side.clone());
    bet.resolved_at_height = Some(env.block.height);
    bet.payout_winner = Some(winner.clone());
    bet.commission_paid = commission;
    bet.payout_amount = payout;
    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new()
        .add_attribute("action", "coinflip.accept_and_reveal")
        .add_attribute("bet_id", bet_id.to_string())
        .add_attribute("acceptor", info.sender.to_string())
        .add_attribute("guess", format!("{:?}", guess))
        .add_attribute("side", format!("{:?}", side))
        .add_attribute("winner", winner.to_string())
        .add_attribute("payout", payout.to_string())
        .add_attribute("commission", commission.to_string())
        .add_attribute("treasury", config.treasury.to_string()))
}
