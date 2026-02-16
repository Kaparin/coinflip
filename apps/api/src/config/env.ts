import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from monorepo root (in production, env vars are injected by the platform)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

// Railway injects PORT; map to API_PORT if not explicitly set
if (process.env.PORT && !process.env.API_PORT) {
  process.env.API_PORT = process.env.PORT;
}

const envSchema = z.object({
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5433/coinflip'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AXIOME_RPC_URL: z.string().default('http://49.13.3.227:26657'),
  AXIOME_REST_URL: z.string().default('http://49.13.3.227:1317'),
  AXIOME_CHAIN_ID: z.string().default('axiome-1'),
  COINFLIP_CONTRACT_ADDR: z.string().default(''),
  LAUNCH_CW20_ADDR: z.string().default(''),
  RELAYER_MNEMONIC: z.string().default(''),
  RELAYER_ADDRESS: z.string().default(''),
  TREASURY_ADDRESS: z.string().default(''),
  ADMIN_ADDRESSES: z.string().default(''),
  /** Enable background sweep (auto-reveal, auto-cancel, orphan cleanup). Default: true in prod, false in dev. */
  ENABLE_BACKGROUND_SWEEP: z.string().default(process.env.NODE_ENV === 'production' ? 'true' : 'false'),
  /** Enable chain indexer (event polling). Default: true in prod, false in dev. */
  ENABLE_INDEXER: z.string().default(process.env.NODE_ENV === 'production' ? 'true' : 'false'),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
