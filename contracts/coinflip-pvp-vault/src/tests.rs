use cosmwasm_std::{Uint128, Binary};
use crate::error::ContractError;
use crate::msg::Side;
use crate::testing::helpers::*;

// ============================================================
// Instantiation
// ============================================================

#[test]
fn test_instantiate_success() {
    let (deps, env) = setup_contract();
    let config = query_config(&deps, &env);

    assert_eq!(config.admin, ADMIN);
    assert_eq!(config.token_cw20, TOKEN_CW20);
    assert_eq!(config.treasury, TREASURY);
    assert_eq!(config.commission_bps, 1000);
    assert_eq!(config.min_bet, Uint128::new(10));
    assert_eq!(config.reveal_timeout_secs, 300);
    assert_eq!(config.max_open_per_user, 10);
}

// ============================================================
// Deposits
// ============================================================

#[test]
fn test_deposit_success() {
    let (mut deps, env) = setup_contract();

    let res = deposit(&mut deps, &env, MAKER, 500).unwrap();
    assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "deposit"));
    assert!(res.attributes.iter().any(|a| a.key == "amount" && a.value == "500"));

    let balance = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(balance.available, Uint128::new(500));
    assert_eq!(balance.locked, Uint128::zero());
}

#[test]
fn test_deposit_multiple() {
    let (mut deps, env) = setup_contract();

    deposit(&mut deps, &env, MAKER, 100).unwrap();
    deposit(&mut deps, &env, MAKER, 200).unwrap();

    let balance = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(balance.available, Uint128::new(300));
}

#[test]
fn test_deposit_wrong_token_rejected() {
    let (mut deps, env) = setup_contract();

    let cw20_msg = cw20::Cw20ReceiveMsg {
        sender: MAKER.to_string(),
        amount: Uint128::new(100),
        msg: cosmwasm_std::to_json_binary(&crate::msg::ReceiveMsg::Deposit {}).unwrap(),
    };
    let info = cosmwasm_std::testing::mock_info("wrong_token", &[]);
    let err = crate::contract::execute(
        deps.as_mut(), env, info,
        crate::msg::ExecuteMsg::Receive(cw20_msg),
    ).unwrap_err();

    match err {
        ContractError::InvalidToken { .. } => {}
        _ => panic!("Expected InvalidToken, got {:?}", err),
    }
}

// ============================================================
// Withdrawals
// ============================================================

#[test]
fn test_withdraw_success() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();

    let info = cosmwasm_std::testing::mock_info(MAKER, &[]);
    let res = crate::contract::execute(
        deps.as_mut(), env.clone(), info,
        crate::msg::ExecuteMsg::Withdraw { amount: Uint128::new(200) },
    ).unwrap();

    // Should have a CW20 transfer submessage
    assert_eq!(res.messages.len(), 1);

    let balance = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(balance.available, Uint128::new(300));
}

#[test]
fn test_withdraw_insufficient_balance() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 100).unwrap();

    let info = cosmwasm_std::testing::mock_info(MAKER, &[]);
    let err = crate::contract::execute(
        deps.as_mut(), env, info,
        crate::msg::ExecuteMsg::Withdraw { amount: Uint128::new(200) },
    ).unwrap_err();

    match err {
        ContractError::InsufficientAvailableBalance { .. } => {}
        _ => panic!("Expected InsufficientAvailableBalance, got {:?}", err),
    }
}

// ============================================================
// Create Bet
// ============================================================

#[test]
fn test_create_bet_success() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();

    let secret = b"my_secret_32_bytes_exactly_here!!" ;
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);

    let res = create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "coinflip.bet_created"));
    assert!(res.attributes.iter().any(|a| a.key == "bet_id" && a.value == "1"));

    // Balance: 500 - 100 locked
    let balance = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(balance.available, Uint128::new(400));
    assert_eq!(balance.locked, Uint128::new(100));

    // Verify bet in storage
    let bet = query_bet(&deps, &env, 1);
    assert_eq!(bet.id, 1);
    assert_eq!(bet.amount, Uint128::new(100));
    assert_eq!(bet.status, "open");
}

#[test]
fn test_create_bet_below_minimum() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    let err = create_bet(&mut deps, &env, MAKER, 5, commitment).unwrap_err();

    match err {
        ContractError::BetAmountBelowMinimum { .. } => {}
        _ => panic!("Expected BetAmountBelowMinimum, got {:?}", err),
    }
}

#[test]
fn test_create_bet_insufficient_balance() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 50).unwrap();

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    let err = create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap_err();

    match err {
        ContractError::InsufficientAvailableBalance { .. } => {}
        _ => panic!("Expected InsufficientAvailableBalance, got {:?}", err),
    }
}

#[test]
fn test_create_bet_too_many_open() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 10_000).unwrap();

    // Create 10 bets (max)
    for i in 0..10 {
        let commitment = compute_commitment(MAKER, &Side::Heads, format!("secret_{:032}", i).as_bytes());
        create_bet(&mut deps, &env, MAKER, 10, commitment).unwrap();
    }

    // 11th should fail
    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    let err = create_bet(&mut deps, &env, MAKER, 10, commitment).unwrap_err();

    match err {
        ContractError::TooManyOpenBets { max: 10 } => {}
        _ => panic!("Expected TooManyOpenBets, got {:?}", err),
    }
}

// ============================================================
// Cancel Bet
// ============================================================

#[test]
fn test_cancel_bet_success() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();

    let res = cancel_bet(&mut deps, &env, MAKER, 1).unwrap();
    assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "coinflip.bet_canceled"));

    // Funds unlocked
    let balance = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(balance.available, Uint128::new(500));
    assert_eq!(balance.locked, Uint128::zero());

    // Bet status
    let bet = query_bet(&deps, &env, 1);
    assert_eq!(bet.status, "canceled");
}

#[test]
fn test_cancel_bet_not_maker() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();

    let err = cancel_bet(&mut deps, &env, ACCEPTOR, 1).unwrap_err();
    match err {
        ContractError::Unauthorized => {}
        _ => panic!("Expected Unauthorized, got {:?}", err),
    }
}

#[test]
fn test_cancel_accepted_bet_fails() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    let err = cancel_bet(&mut deps, &env, MAKER, 1).unwrap_err();
    match err {
        ContractError::InvalidStateTransition { .. } => {}
        _ => panic!("Expected InvalidStateTransition, got {:?}", err),
    }
}

// ============================================================
// Accept Bet
// ============================================================

#[test]
fn test_accept_bet_success() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();

    let res = accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();
    assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "coinflip.bet_accepted"));

    // Acceptor funds locked
    let balance = query_vault_balance(&deps, &env, ACCEPTOR);
    assert_eq!(balance.available, Uint128::new(400));
    assert_eq!(balance.locked, Uint128::new(100));

    let bet = query_bet(&deps, &env, 1);
    assert_eq!(bet.status, "accepted");
    assert_eq!(bet.acceptor_guess, Some(Side::Tails));
}

#[test]
fn test_self_accept_rejected() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();

    let err = accept_bet(&mut deps, &env, MAKER, 1, Side::Tails).unwrap_err();
    match err {
        ContractError::SelfAcceptNotAllowed => {}
        _ => panic!("Expected SelfAcceptNotAllowed, got {:?}", err),
    }
}

#[test]
fn test_accept_insufficient_balance() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 50).unwrap(); // Not enough

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();

    let err = accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap_err();
    match err {
        ContractError::InsufficientAvailableBalance { .. } => {}
        _ => panic!("Expected InsufficientAvailableBalance, got {:?}", err),
    }
}

#[test]
fn test_double_accept_rejected() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();
    deposit(&mut deps, &env, RANDOM_USER, 500).unwrap();

    let commitment = compute_commitment(MAKER, &Side::Heads, b"secret_32_bytes_exactly_here!!!!");
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Second accept should fail
    let err = accept_bet(&mut deps, &env, RANDOM_USER, 1, Side::Heads).unwrap_err();
    match err {
        ContractError::InvalidStateTransition { .. } => {}
        _ => panic!("Expected InvalidStateTransition, got {:?}", err),
    }
}

// ============================================================
// Reveal — Maker wins (acceptor guessed wrong)
// ============================================================

#[test]
fn test_reveal_maker_wins() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let maker_side = Side::Heads;
    let commitment = compute_commitment(MAKER, &maker_side, secret);

    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap(); // Guesses wrong

    let res = reveal_bet(
        &mut deps, &env, MAKER, 1,
        Side::Heads, Binary::from(secret.to_vec()),
    ).unwrap();

    assert!(res.attributes.iter().any(|a| a.key == "winner" && a.value == MAKER));

    // Payout: pot=200, commission=20 (10%), winner gets 180
    let maker_bal = query_vault_balance(&deps, &env, MAKER);
    // Started 500, locked 100, then won 180: 400 + 180 = 580
    assert_eq!(maker_bal.available, Uint128::new(580));
    assert_eq!(maker_bal.locked, Uint128::zero());

    let acceptor_bal = query_vault_balance(&deps, &env, ACCEPTOR);
    // Started 500, locked 100, lost all: 400
    assert_eq!(acceptor_bal.available, Uint128::new(400));
    assert_eq!(acceptor_bal.locked, Uint128::zero());

    // Treasury got commission
    let treasury_bal = query_vault_balance(&deps, &env, TREASURY);
    assert_eq!(treasury_bal.available, Uint128::new(20));

    let bet = query_bet(&deps, &env, 1);
    assert_eq!(bet.status, "revealed");
    assert_eq!(bet.winner, Some(cosmwasm_std::Addr::unchecked(MAKER)));
}

// ============================================================
// Reveal — Acceptor wins (acceptor guessed correctly)
// ============================================================

#[test]
fn test_reveal_acceptor_wins() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let maker_side = Side::Heads;
    let commitment = compute_commitment(MAKER, &maker_side, secret);

    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Heads).unwrap(); // Guesses correctly!

    let res = reveal_bet(
        &mut deps, &env, MAKER, 1,
        Side::Heads, Binary::from(secret.to_vec()),
    ).unwrap();

    assert!(res.attributes.iter().any(|a| a.key == "winner" && a.value == ACCEPTOR));

    let maker_bal = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(maker_bal.available, Uint128::new(400)); // Lost 100
    assert_eq!(maker_bal.locked, Uint128::zero());

    let acceptor_bal = query_vault_balance(&deps, &env, ACCEPTOR);
    // 400 + 180 (pot - commission) = 580
    assert_eq!(acceptor_bal.available, Uint128::new(580));

    let treasury_bal = query_vault_balance(&deps, &env, TREASURY);
    assert_eq!(treasury_bal.available, Uint128::new(20));
}

// ============================================================
// Reveal — Commitment mismatch
// ============================================================

#[test]
fn test_reveal_wrong_secret_rejected() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);

    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Reveal with wrong secret
    let err = reveal_bet(
        &mut deps, &env, MAKER, 1,
        Side::Heads, Binary::from(b"wrong_secret_totally_different!!".to_vec()),
    ).unwrap_err();

    match err {
        ContractError::CommitmentMismatch => {}
        _ => panic!("Expected CommitmentMismatch, got {:?}", err),
    }
}

#[test]
fn test_reveal_wrong_side_rejected() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);

    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Reveal with wrong side (committed Heads but claims Tails)
    let err = reveal_bet(
        &mut deps, &env, MAKER, 1,
        Side::Tails, Binary::from(secret.to_vec()),
    ).unwrap_err();

    match err {
        ContractError::CommitmentMismatch => {}
        _ => panic!("Expected CommitmentMismatch, got {:?}", err),
    }
}

#[test]
fn test_reveal_not_maker_rejected() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);

    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Acceptor tries to reveal
    let err = reveal_bet(
        &mut deps, &env, ACCEPTOR, 1,
        Side::Heads, Binary::from(secret.to_vec()),
    ).unwrap_err();

    match err {
        ContractError::Unauthorized => {}
        _ => panic!("Expected Unauthorized, got {:?}", err),
    }
}

// ============================================================
// Reveal — Timeout expired
// ============================================================

#[test]
fn test_reveal_after_timeout_rejected() {
    let (mut deps, _) = setup_contract();

    // Deposit at t=1000
    let env = env_at_time(1000);
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();

    // Accept at t=1000
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Try to reveal at t=1400 (timeout=300s, accepted at 1000, deadline=1300)
    let late_env = env_at_time(1400);
    let err = reveal_bet(
        &mut deps, &late_env, MAKER, 1,
        Side::Heads, Binary::from(secret.to_vec()),
    ).unwrap_err();

    match err {
        ContractError::RevealTimeoutExpired { .. } => {}
        _ => panic!("Expected RevealTimeoutExpired, got {:?}", err),
    }
}

// ============================================================
// Claim Timeout
// ============================================================

#[test]
fn test_claim_timeout_success() {
    let (mut deps, _) = setup_contract();

    let env = env_at_time(1000);
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Claim at t=1400 (after 300s timeout)
    let late_env = env_at_time(1400);
    let res = claim_timeout(&mut deps, &late_env, ACCEPTOR, 1).unwrap();
    assert!(res.attributes.iter().any(|a| a.key == "winner" && a.value == ACCEPTOR));

    // Acceptor wins by default
    let acceptor_bal = query_vault_balance(&deps, &env, ACCEPTOR);
    assert_eq!(acceptor_bal.available, Uint128::new(580)); // 400 + 180
    assert_eq!(acceptor_bal.locked, Uint128::zero());

    let maker_bal = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(maker_bal.available, Uint128::new(400)); // Lost 100
    assert_eq!(maker_bal.locked, Uint128::zero());

    let bet = query_bet(&deps, &env, 1);
    assert_eq!(bet.status, "timeoutclaimed");
}

#[test]
fn test_claim_timeout_too_early() {
    let (mut deps, _) = setup_contract();

    let env = env_at_time(1000);
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Try to claim at t=1200 (before 300s timeout)
    let early_env = env_at_time(1200);
    let err = claim_timeout(&mut deps, &early_env, ACCEPTOR, 1).unwrap_err();

    match err {
        ContractError::RevealNotYetExpired { .. } => {}
        _ => panic!("Expected RevealNotYetExpired, got {:?}", err),
    }
}

#[test]
fn test_claim_timeout_not_acceptor() {
    let (mut deps, _) = setup_contract();

    let env = env_at_time(1000);
    deposit(&mut deps, &env, MAKER, 500).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 500).unwrap();

    let secret = b"secret_32_bytes_exactly_here!!!!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);
    create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Maker tries to claim timeout (should fail)
    let late_env = env_at_time(1400);
    let err = claim_timeout(&mut deps, &late_env, MAKER, 1).unwrap_err();

    match err {
        ContractError::Unauthorized => {}
        _ => panic!("Expected Unauthorized, got {:?}", err),
    }
}

// ============================================================
// Open bets query
// ============================================================

#[test]
fn test_query_open_bets() {
    let (mut deps, env) = setup_contract();
    deposit(&mut deps, &env, MAKER, 5000).unwrap();

    for i in 0..3 {
        let commitment = compute_commitment(MAKER, &Side::Heads, format!("secret_{:032}", i).as_bytes());
        create_bet(&mut deps, &env, MAKER, 100, commitment).unwrap();
    }

    let open = query_open_bets(&deps, &env);
    assert_eq!(open.bets.len(), 3);

    // Cancel one
    cancel_bet(&mut deps, &env, MAKER, 1).unwrap();
    let open = query_open_bets(&deps, &env);
    assert_eq!(open.bets.len(), 2);
}

// ============================================================
// Full game flow end-to-end
// ============================================================

#[test]
fn test_full_game_flow_maker_wins() {
    let (mut deps, _) = setup_contract();
    let env = env_at_time(1000);

    // 1. Both deposit
    deposit(&mut deps, &env, MAKER, 1000).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 1000).unwrap();

    // 2. Maker creates bet (Heads, 200 LAUNCH)
    let secret = b"super_secret_value_32bytes_long!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);
    create_bet(&mut deps, &env, MAKER, 200, commitment).unwrap();

    // 3. Acceptor accepts (guesses Tails — wrong!)
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // 4. Maker reveals within timeout (t=1100, well within 1300 deadline)
    let reveal_env = env_at_time(1100);
    reveal_bet(
        &mut deps, &reveal_env, MAKER, 1,
        Side::Heads, Binary::from(secret.to_vec()),
    ).unwrap();

    // 5. Verify final state
    let bet = query_bet(&deps, &env, 1);
    assert_eq!(bet.status, "revealed");
    assert_eq!(bet.winner, Some(cosmwasm_std::Addr::unchecked(MAKER)));
    assert_eq!(bet.payout_amount, Some(Uint128::new(360))); // 400 pot - 40 commission
    assert_eq!(bet.commission_paid, Some(Uint128::new(40)));

    // Maker: 1000 - 200 locked + 360 won = 1160
    let maker_bal = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(maker_bal.available, Uint128::new(1160));

    // Acceptor: 1000 - 200 locked, lost = 800
    let acceptor_bal = query_vault_balance(&deps, &env, ACCEPTOR);
    assert_eq!(acceptor_bal.available, Uint128::new(800));

    // Treasury: 40 commission
    let treasury_bal = query_vault_balance(&deps, &env, TREASURY);
    assert_eq!(treasury_bal.available, Uint128::new(40));
}

#[test]
fn test_full_game_flow_timeout_claim() {
    let (mut deps, _) = setup_contract();
    let env = env_at_time(1000);

    deposit(&mut deps, &env, MAKER, 1000).unwrap();
    deposit(&mut deps, &env, ACCEPTOR, 1000).unwrap();

    let secret = b"super_secret_value_32bytes_long!";
    let commitment = compute_commitment(MAKER, &Side::Heads, secret);
    create_bet(&mut deps, &env, MAKER, 200, commitment).unwrap();
    accept_bet(&mut deps, &env, ACCEPTOR, 1, Side::Tails).unwrap();

    // Maker doesn't reveal. Acceptor claims after timeout.
    let timeout_env = env_at_time(1400);
    claim_timeout(&mut deps, &timeout_env, ACCEPTOR, 1).unwrap();

    // Acceptor wins 360 (pot 400 - 40 commission)
    let acceptor_bal = query_vault_balance(&deps, &env, ACCEPTOR);
    assert_eq!(acceptor_bal.available, Uint128::new(1160));

    // Maker loses 200
    let maker_bal = query_vault_balance(&deps, &env, MAKER);
    assert_eq!(maker_bal.available, Uint128::new(800));
}
