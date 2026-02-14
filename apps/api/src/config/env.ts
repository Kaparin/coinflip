import { z } from 'zod';

const envSchema = z.object({
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5433/coinflip'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AXIOME_RPC_URL: z.string().default('https://rpc.axiome.pro'),
  AXIOME_REST_URL: z.string().default('https://api-chain.axiomechain.org'),
  AXIOME_CHAIN_ID: z.string().default('axiome-2'),
  COINFLIP_CONTRACT_ADDR: z.string().default(''),
  LAUNCH_CW20_ADDR: z.string().default(''),
  RELAYER_MNEMONIC: z.string().default(''),
  RELAYER_ADDRESS: z.string().default(''),
  TREASURY_ADDRESS: z.string().default(''),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
