#[cfg(test)]
pub mod helpers {
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info, MockApi, MockQuerier, MockStorage};
    use cosmwasm_std::{
        from_json, to_json_binary, Binary, Env,
        OwnedDeps, Response, Timestamp, Uint128,
    };
    use sha2::{Digest, Sha256};

    use crate::contract::{execute, instantiate, query};
    use crate::msg::*;

    pub const ADMIN: &str = "admin";
    pub const TREASURY: &str = "treasury";
    pub const TOKEN_CW20: &str = "launch_token";
    pub const MAKER: &str = "maker_user";
    pub const ACCEPTOR: &str = "acceptor_user";
    pub const RANDOM_USER: &str = "random_user";

    pub fn default_instantiate_msg() -> InstantiateMsg {
        InstantiateMsg {
            token_cw20: TOKEN_CW20.to_string(),
            treasury: TREASURY.to_string(),
            commission_bps: 1000,  // 10%
            min_bet: Uint128::new(10),
            reveal_timeout_secs: 300, // 5 minutes
            max_open_per_user: 10,
            max_daily_amount_per_user: Uint128::new(10_000),
            bet_ttl_secs: 10800, // 3 hours
        }
    }

    pub fn setup_contract() -> (OwnedDeps<MockStorage, MockApi, MockQuerier>, Env) {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let info = mock_info(ADMIN, &[]);

        let msg = default_instantiate_msg();
        let res = instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();
        assert_eq!(res.attributes.len(), 3);

        (deps, env)
    }

    /// Deposit LAUNCH tokens for a user (simulates CW20 Send)
    pub fn deposit(
        deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
        user: &str,
        amount: u128,
    ) -> Result<Response, crate::error::ContractError> {
        let cw20_msg = cw20::Cw20ReceiveMsg {
            sender: user.to_string(),
            amount: Uint128::new(amount),
            msg: to_json_binary(&ReceiveMsg::Deposit {}).unwrap(),
        };

        // Info sender is the CW20 token contract
        let info = mock_info(TOKEN_CW20, &[]);
        execute(deps.as_mut(), env.clone(), info, ExecuteMsg::Receive(cw20_msg))
    }

    /// Compute commitment: SHA256("coinflip_v1" || maker_addr || side || secret)
    pub fn compute_commitment(maker: &str, side: &Side, secret: &[u8]) -> Binary {
        let side_bytes = match side {
            Side::Heads => b"heads".to_vec(),
            Side::Tails => b"tails".to_vec(),
        };

        let mut hasher = Sha256::new();
        hasher.update(b"coinflip_v1");
        hasher.update(maker.as_bytes());
        hasher.update(&side_bytes);
        hasher.update(secret);
        Binary::from(hasher.finalize().to_vec())
    }

    pub fn create_bet(
        deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
        maker: &str,
        amount: u128,
        commitment: Binary,
    ) -> Result<Response, crate::error::ContractError> {
        let info = mock_info(maker, &[]);
        execute(
            deps.as_mut(),
            env.clone(),
            info,
            ExecuteMsg::CreateBet {
                amount: Uint128::new(amount),
                commitment,
            },
        )
    }

    pub fn accept_bet(
        deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
        acceptor: &str,
        bet_id: u64,
        guess: Side,
    ) -> Result<Response, crate::error::ContractError> {
        let info = mock_info(acceptor, &[]);
        execute(
            deps.as_mut(),
            env.clone(),
            info,
            ExecuteMsg::AcceptBet { bet_id, guess },
        )
    }

    pub fn reveal_bet(
        deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
        maker: &str,
        bet_id: u64,
        side: Side,
        secret: Binary,
    ) -> Result<Response, crate::error::ContractError> {
        let info = mock_info(maker, &[]);
        execute(
            deps.as_mut(),
            env.clone(),
            info,
            ExecuteMsg::Reveal {
                bet_id,
                side,
                secret,
            },
        )
    }

    pub fn cancel_bet(
        deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
        sender: &str,
        bet_id: u64,
    ) -> Result<Response, crate::error::ContractError> {
        let info = mock_info(sender, &[]);
        execute(
            deps.as_mut(),
            env.clone(),
            info,
            ExecuteMsg::CancelBet { bet_id },
        )
    }

    pub fn claim_timeout(
        deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
        sender: &str,
        bet_id: u64,
    ) -> Result<Response, crate::error::ContractError> {
        let info = mock_info(sender, &[]);
        execute(
            deps.as_mut(),
            env.clone(),
            info,
            ExecuteMsg::ClaimTimeout { bet_id },
        )
    }

    pub fn query_config(
        deps: &OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
    ) -> ConfigResponse {
        let res = query(deps.as_ref(), env.clone(), QueryMsg::Config {}).unwrap();
        from_json(&res).unwrap()
    }

    pub fn query_vault_balance(
        deps: &OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
        address: &str,
    ) -> VaultBalanceResponse {
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::VaultBalance { address: address.to_string() },
        ).unwrap();
        from_json(&res).unwrap()
    }

    pub fn query_bet(
        deps: &OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
        bet_id: u64,
    ) -> BetResponse {
        let res = query(deps.as_ref(), env.clone(), QueryMsg::Bet { bet_id }).unwrap();
        from_json(&res).unwrap()
    }

    pub fn query_open_bets(
        deps: &OwnedDeps<MockStorage, MockApi, MockQuerier>,
        env: &Env,
    ) -> BetsResponse {
        let res = query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::OpenBets { start_after: None, limit: None },
        ).unwrap();
        from_json(&res).unwrap()
    }

    /// Create an env with a specific block time
    pub fn env_at_time(secs: u64) -> Env {
        let mut env = mock_env();
        env.block.time = Timestamp::from_seconds(secs);
        env
    }
}
