use cosmwasm_std::{
    entry_point, to_json_binary, Addr, Binary, Deps, DepsMut, Env, MessageInfo, Response,
    StdResult,
};
use cw20_base::ContractError;
use serde::{Deserialize, Serialize};

// Re-export cw20-base execute and query (unchanged)
#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: cw20_base::msg::InstantiateMsg,
) -> Result<Response, ContractError> {
    cw20_base::contract::instantiate(deps, env, info, msg)
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: cw20_base::msg::ExecuteMsg,
) -> Result<Response, ContractError> {
    cw20_base::contract::execute(deps, env, info, msg)
}

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: cw20_base::msg::QueryMsg) -> StdResult<Binary> {
    cw20_base::contract::query(deps, env, msg)
}

/// Custom migrate message that updates marketing info in storage.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MigrateMsg {
    pub description: Option<String>,
    pub project: Option<String>,
    pub marketing: Option<String>,
}

/// The MARKETING_INFO storage key used by cw20-base (cw_storage_plus Item key)
const MARKETING_INFO_KEY: &str = "marketing_info";

/// Marketing info structure matching cw20-base internal storage format
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct MarketingInfoResponse {
    pub project: Option<String>,
    pub description: Option<String>,
    pub marketing: Option<Addr>,
    pub logo: Option<Logo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum Logo {
    Url(String),
    Embedded(EmbeddedLogo),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum EmbeddedLogo {
    Svg(Binary),
    Png(Binary),
}

#[entry_point]
pub fn migrate(deps: DepsMut, _env: Env, msg: MigrateMsg) -> Result<Response, ContractError> {
    // Validate marketing address first (before borrowing storage)
    let marketing_addr: Option<Addr> = msg
        .marketing
        .map(|addr| deps.api.addr_validate(&addr))
        .transpose()
        .map_err(ContractError::Std)?;

    // Read existing marketing info from storage
    let existing: MarketingInfoResponse = deps
        .storage
        .get(MARKETING_INFO_KEY.as_bytes())
        .and_then(|data| cosmwasm_std::from_json(&data).ok())
        .unwrap_or_default();

    // Update fields — new values take priority, fallback to existing
    let updated = MarketingInfoResponse {
        description: msg.description.or(existing.description),
        project: msg.project.or(existing.project),
        marketing: marketing_addr.or(existing.marketing),
        logo: existing.logo,
    };

    // Write back to storage
    let data = to_json_binary(&updated)?;
    deps.storage.set(MARKETING_INFO_KEY.as_bytes(), &data);

    Ok(Response::new().add_attribute("action", "migrate_fix_marketing"))
}
