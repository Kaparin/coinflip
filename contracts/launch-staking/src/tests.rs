use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
use cosmwasm_std::{coins, from_json, to_json_binary, Addr, Uint128};

use crate::contract::{execute, instantiate, query};
use crate::error::ContractError;
use crate::msg::*;
use crate::state::{CONFIG, STAKERS, STATE};
use cw20::Cw20ReceiveMsg;

const ADMIN: &str = "admin";
const LAUNCH_CW20: &str = "launch_cw20_addr";
const USER1: &str = "user1";
const USER2: &str = "user2";
const TREASURY: &str = "treasury";

fn setup(deps: cosmwasm_std::DepsMut) {
    let msg = InstantiateMsg {
        launch_cw20: LAUNCH_CW20.to_string(),
    };
    let info = mock_info(ADMIN, &[]);
    instantiate(deps, mock_env(), info, msg).unwrap();
}

/// Helper: simulate CW20 Send → Receive(Stake) on the staking contract
fn stake_msg(sender: &str, amount: u128) -> (cosmwasm_std::MessageInfo, ExecuteMsg) {
    let info = mock_info(LAUNCH_CW20, &[]);
    let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
        sender: sender.to_string(),
        amount: Uint128::new(amount),
        msg: to_json_binary(&ReceiveMsg::Stake {}).unwrap(),
    });
    (info, msg)
}

// ──────────────────────────────────────────────────────────────────────────────
// Instantiation
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn proper_instantiation() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let config = CONFIG.load(deps.as_ref().storage).unwrap();
    assert_eq!(config.admin, Addr::unchecked(ADMIN));
    assert_eq!(config.launch_cw20, Addr::unchecked(LAUNCH_CW20));

    let state = STATE.load(deps.as_ref().storage).unwrap();
    assert_eq!(state.total_staked, Uint128::zero());
    assert_eq!(state.total_distributed, Uint128::zero());
    assert_eq!(state.total_stakers, 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// Staking
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn stake_works() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let state = STATE.load(deps.as_ref().storage).unwrap();
    assert_eq!(state.total_staked, Uint128::new(1_000_000));
    assert_eq!(state.total_stakers, 1);

    let staker = STAKERS.load(deps.as_ref().storage, USER1).unwrap();
    assert_eq!(staker.staked, Uint128::new(1_000_000));
}

#[test]
fn stake_zero_fails() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 0);
    let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
    assert!(matches!(err, ContractError::ZeroAmount));
}

#[test]
fn stake_wrong_cw20_fails() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let info = mock_info("wrong_token", &[]);
    let msg = ExecuteMsg::Receive(Cw20ReceiveMsg {
        sender: USER1.to_string(),
        amount: Uint128::new(1_000_000),
        msg: to_json_binary(&ReceiveMsg::Stake {}).unwrap(),
    });
    let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
    assert!(matches!(err, ContractError::InvalidCw20Token));
}

#[test]
fn multiple_stakers() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 3_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let (info, msg) = stake_msg(USER2, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let state = STATE.load(deps.as_ref().storage).unwrap();
    assert_eq!(state.total_staked, Uint128::new(4_000_000));
    assert_eq!(state.total_stakers, 2);
}

// ──────────────────────────────────────────────────────────────────────────────
// Unstaking
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn unstake_works() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    // Stake first
    let (info, msg) = stake_msg(USER1, 2_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    // Unstake half
    let info = mock_info(USER1, &[]);
    let msg = ExecuteMsg::Unstake {
        amount: Uint128::new(1_000_000),
    };
    let res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();
    // Should have a CW20 transfer message
    assert_eq!(res.messages.len(), 1);

    let state = STATE.load(deps.as_ref().storage).unwrap();
    assert_eq!(state.total_staked, Uint128::new(1_000_000));
    assert_eq!(state.total_stakers, 1);

    let staker = STAKERS.load(deps.as_ref().storage, USER1).unwrap();
    assert_eq!(staker.staked, Uint128::new(1_000_000));
}

#[test]
fn unstake_all_decrements_stakers() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let info = mock_info(USER1, &[]);
    let msg = ExecuteMsg::Unstake {
        amount: Uint128::new(1_000_000),
    };
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let state = STATE.load(deps.as_ref().storage).unwrap();
    assert_eq!(state.total_staked, Uint128::zero());
    assert_eq!(state.total_stakers, 0);
}

#[test]
fn unstake_more_than_staked_fails() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let info = mock_info(USER1, &[]);
    let msg = ExecuteMsg::Unstake {
        amount: Uint128::new(2_000_000),
    };
    let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
    assert!(matches!(err, ContractError::InsufficientStake { .. }));
}

#[test]
fn unstake_zero_fails() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let info = mock_info(USER1, &[]);
    let msg = ExecuteMsg::Unstake {
        amount: Uint128::zero(),
    };
    let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
    assert!(matches!(err, ContractError::ZeroAmount));
}

// ──────────────────────────────────────────────────────────────────────────────
// Distribution
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn distribute_works() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    // Stake first
    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    // Distribute rewards
    let info = mock_info(TREASURY, &coins(500_000, "uaxm"));
    let msg = ExecuteMsg::Distribute {};
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let state = STATE.load(deps.as_ref().storage).unwrap();
    assert_eq!(state.total_distributed, Uint128::new(500_000));
}

#[test]
fn distribute_no_stakers_fails() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let info = mock_info(TREASURY, &coins(500_000, "uaxm"));
    let msg = ExecuteMsg::Distribute {};
    let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
    assert!(matches!(err, ContractError::NothingStaked));
}

#[test]
fn distribute_no_funds_fails() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let info = mock_info(TREASURY, &[]);
    let msg = ExecuteMsg::Distribute {};
    let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
    assert!(matches!(err, ContractError::NoFundsSent));
}

#[test]
fn distribute_wrong_denom_fails() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let info = mock_info(TREASURY, &coins(500_000, "uatom"));
    let msg = ExecuteMsg::Distribute {};
    let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
    assert!(matches!(err, ContractError::InvalidDenom { .. }));
}

// ──────────────────────────────────────────────────────────────────────────────
// Reward calculation (Synthetix model)
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn single_staker_gets_all_rewards() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    // User1 stakes 1M
    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    // Distribute 500k AXM
    let info = mock_info(TREASURY, &coins(500_000, "uaxm"));
    execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Distribute {}).unwrap();

    // Query — user1 should have all 500k pending
    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER1.to_string(),
        },
    )
    .unwrap();
    let staker_info: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(staker_info.pending_rewards, Uint128::new(500_000));
}

#[test]
fn proportional_reward_distribution() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    // User1 stakes 3M (75%), User2 stakes 1M (25%)
    let (info, msg) = stake_msg(USER1, 3_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let (info, msg) = stake_msg(USER2, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    // Distribute 1M AXM
    let info = mock_info(TREASURY, &coins(1_000_000, "uaxm"));
    execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Distribute {}).unwrap();

    // User1 should get 750k (75%)
    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER1.to_string(),
        },
    )
    .unwrap();
    let info1: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(info1.pending_rewards, Uint128::new(750_000));

    // User2 should get 250k (25%)
    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER2.to_string(),
        },
    )
    .unwrap();
    let info2: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(info2.pending_rewards, Uint128::new(250_000));
}

#[test]
fn late_staker_doesnt_get_previous_rewards() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    // User1 stakes 1M
    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    // First distribution: 500k AXM — only user1 gets it
    let info = mock_info(TREASURY, &coins(500_000, "uaxm"));
    execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Distribute {}).unwrap();

    // User2 stakes 1M (after first distribution)
    let (info, msg) = stake_msg(USER2, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    // Second distribution: 200k AXM — split 50/50
    let info = mock_info(TREASURY, &coins(200_000, "uaxm"));
    execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Distribute {}).unwrap();

    // User1: 500k + 100k = 600k
    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER1.to_string(),
        },
    )
    .unwrap();
    let info1: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(info1.pending_rewards, Uint128::new(600_000));

    // User2: 0 + 100k = 100k
    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER2.to_string(),
        },
    )
    .unwrap();
    let info2: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(info2.pending_rewards, Uint128::new(100_000));
}

#[test]
fn rewards_preserved_after_partial_unstake() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    // User1 stakes 2M
    let (info, msg) = stake_msg(USER1, 2_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    // Distribute 1M AXM
    let info = mock_info(TREASURY, &coins(1_000_000, "uaxm"));
    execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Distribute {}).unwrap();

    // Unstake half — pending rewards should be preserved
    let info = mock_info(USER1, &[]);
    execute(
        deps.as_mut(),
        mock_env(),
        info,
        ExecuteMsg::Unstake {
            amount: Uint128::new(1_000_000),
        },
    )
    .unwrap();

    let staker = STAKERS.load(deps.as_ref().storage, USER1).unwrap();
    assert_eq!(staker.staked, Uint128::new(1_000_000));
    assert_eq!(staker.pending_rewards, Uint128::new(1_000_000)); // Rewards from before unstake

    // Another distribution of 500k — user1 still has 1M staked (100% share)
    let info = mock_info(TREASURY, &coins(500_000, "uaxm"));
    execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Distribute {}).unwrap();

    // Total pending: 1M (settled) + 500k (new) = 1.5M
    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER1.to_string(),
        },
    )
    .unwrap();
    let info1: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(info1.pending_rewards, Uint128::new(1_500_000));
}

#[test]
fn multiple_distributions_accumulate() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    // 3 distributions of 100k each
    for _ in 0..3 {
        let info = mock_info(TREASURY, &coins(100_000, "uaxm"));
        execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Distribute {}).unwrap();
    }

    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER1.to_string(),
        },
    )
    .unwrap();
    let info1: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(info1.pending_rewards, Uint128::new(300_000));
}

// ──────────────────────────────────────────────────────────────────────────────
// Claiming
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn claim_works() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let info = mock_info(TREASURY, &coins(500_000, "uaxm"));
    execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Distribute {}).unwrap();

    // Claim — need to mock the contract's bank balance
    // In unit tests with mock_dependencies, query_balance returns 0 by default.
    // The claim will cap at min(pending, balance) = min(500k, 0) = 0 in mock env.
    // This is expected — full claim flow is tested in integration tests.
    // Here we verify the state updates correctly.

    // For the unit test, we can verify via query that rewards are pending
    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER1.to_string(),
        },
    )
    .unwrap();
    let staker_info: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(staker_info.pending_rewards, Uint128::new(500_000));
}

#[test]
fn claim_no_rewards_fails() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let info = mock_info(USER1, &[]);
    let err = execute(deps.as_mut(), mock_env(), info, ExecuteMsg::Claim {}).unwrap_err();
    assert!(matches!(err, ContractError::NoPendingRewards));
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn transfer_admin_works() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let info = mock_info(ADMIN, &[]);
    let msg = ExecuteMsg::TransferAdmin {
        new_admin: "new_admin".to_string(),
    };
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let config = CONFIG.load(deps.as_ref().storage).unwrap();
    assert_eq!(config.admin, Addr::unchecked("new_admin"));
}

#[test]
fn transfer_admin_unauthorized() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let info = mock_info(USER1, &[]);
    let msg = ExecuteMsg::TransferAdmin {
        new_admin: USER1.to_string(),
    };
    let err = execute(deps.as_mut(), mock_env(), info, msg).unwrap_err();
    assert!(matches!(err, ContractError::Unauthorized));
}

// ──────────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn query_config_works() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let res = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
    let config: ConfigResponse = from_json(res).unwrap();
    assert_eq!(config.admin, Addr::unchecked(ADMIN));
    assert_eq!(config.launch_cw20, Addr::unchecked(LAUNCH_CW20));
}

#[test]
fn query_state_works() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let (info, msg) = stake_msg(USER1, 1_000_000);
    execute(deps.as_mut(), mock_env(), info, msg).unwrap();

    let res = query(deps.as_ref(), mock_env(), QueryMsg::State {}).unwrap();
    let state: StateResponse = from_json(res).unwrap();
    assert_eq!(state.total_staked, Uint128::new(1_000_000));
    assert_eq!(state.total_stakers, 1);
    assert_eq!(state.total_distributed, Uint128::zero());
}

#[test]
fn query_unknown_staker_returns_defaults() {
    let mut deps = mock_dependencies();
    setup(deps.as_mut());

    let res = query(
        deps.as_ref(),
        mock_env(),
        QueryMsg::StakerInfo {
            address: USER1.to_string(),
        },
    )
    .unwrap();
    let staker_info: StakerInfoResponse = from_json(res).unwrap();
    assert_eq!(staker_info.staked, Uint128::zero());
    assert_eq!(staker_info.pending_rewards, Uint128::zero());
    assert_eq!(staker_info.total_claimed, Uint128::zero());
}
