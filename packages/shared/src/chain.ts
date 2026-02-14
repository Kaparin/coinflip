/**
 * Axiome Chain configuration.
 * All chain-specific constants live here — shared between API and frontend.
 *
 * Official docs: https://docs.axiomeinfo.org/developer-documentation/useful-links
 * Node source:   https://github.com/axiome-pro/axm-node
 * Explorer:      https://axiomechain.org
 *
 * Axiome Chain is built on Cosmos SDK v0.50.3 + CosmWasm (wasmd v0.50.0).
 */

/** Axiome Chain bech32 address prefix (confirmed from on-chain explorer) */
export const AXIOME_PREFIX = 'axm';

/** Default Chain ID for Axiome mainnet */
export const DEFAULT_CHAIN_ID = 'axiome-2';

/**
 * Default RPC endpoint (Tendermint/CometBFT RPC).
 * Used by CosmJS StargateClient.connect() and SigningStargateClient.
 */
export const DEFAULT_RPC_URL = 'https://rpc.axiome.pro';

/**
 * Default REST (LCD) endpoint — public gRPC REST gateway.
 * Official: https://api-chain.axiomechain.org
 * Used by the indexer for block/tx queries.
 */
export const DEFAULT_REST_URL = 'https://api-chain.axiomechain.org';

/**
 * Swagger docs for the node REST API.
 * http://api-docs.axiomeinfo.org:1317/swagger/
 */
export const NODE_SWAGGER_URL = 'http://api-docs.axiomeinfo.org:1317/swagger/';

/** Default gas price for Axiome */
export const DEFAULT_GAS_PRICE = '0.025uaxm';

/** Fee/staking denom (micro-AXM) */
export const FEE_DENOM = 'uaxm';

/** Display denom */
export const DISPLAY_DENOM = 'AXM';

/** Coin decimals (1 AXM = 10^6 uaxm) */
export const COIN_DECIMALS = 6;

/** CW20 token denom label */
export const LAUNCH_TOKEN_LABEL = 'LAUNCH';

/** Gas adjustment multiplier for estimation */
export const GAS_ADJUSTMENT = 1.4;

/** Default gas limit for MsgExec transactions */
export const DEFAULT_EXEC_GAS_LIMIT = 500_000;

/** Axiome chain registry-compatible config (for Keplr/CosmJS) */
export interface AxiomeChainConfig {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bech32Config: {
    bech32PrefixAccAddr: string;
    bech32PrefixAccPub: string;
    bech32PrefixValAddr: string;
    bech32PrefixValPub: string;
    bech32PrefixConsAddr: string;
    bech32PrefixConsPub: string;
  };
  currencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
  }>;
  feeCurrencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
    gasPriceStep: {
      low: number;
      average: number;
      high: number;
    };
  }>;
  stakeCurrency: {
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
  };
}

/** Default Axiome chain config for wallet integration */
export function getAxiomeChainConfig(overrides?: {
  chainId?: string;
  rpc?: string;
  rest?: string;
}): AxiomeChainConfig {
  return {
    chainId: overrides?.chainId ?? DEFAULT_CHAIN_ID,
    chainName: 'Axiome',
    rpc: overrides?.rpc ?? DEFAULT_RPC_URL,
    rest: overrides?.rest ?? DEFAULT_REST_URL,
    bech32Config: {
      bech32PrefixAccAddr: AXIOME_PREFIX,
      bech32PrefixAccPub: `${AXIOME_PREFIX}pub`,
      bech32PrefixValAddr: `${AXIOME_PREFIX}valoper`,
      bech32PrefixValPub: `${AXIOME_PREFIX}valoperpub`,
      bech32PrefixConsAddr: `${AXIOME_PREFIX}valcons`,
      bech32PrefixConsPub: `${AXIOME_PREFIX}valconspub`,
    },
    currencies: [
      {
        coinDenom: DISPLAY_DENOM,
        coinMinimalDenom: FEE_DENOM,
        coinDecimals: COIN_DECIMALS,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: DISPLAY_DENOM,
        coinMinimalDenom: FEE_DENOM,
        coinDecimals: COIN_DECIMALS,
        gasPriceStep: {
          low: 0.01,
          average: 0.025,
          high: 0.05,
        },
      },
    ],
    stakeCurrency: {
      coinDenom: DISPLAY_DENOM,
      coinMinimalDenom: FEE_DENOM,
      coinDecimals: COIN_DECIMALS,
    },
  };
}
