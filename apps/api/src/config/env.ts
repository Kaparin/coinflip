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
  NODE_ENV: z.string().default('development'),
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5433/coinflip'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AXIOME_RPC_URL: z.string().default('http://49.13.3.227:26657'),
  AXIOME_REST_URL: z.string().default('http://49.13.3.227:1317'),
  /** Comma-separated fallback REST URLs for chain queries (tried in order after primary) */
  AXIOME_REST_URLS_FALLBACK: z.string().default(''),
  AXIOME_CHAIN_ID: z.string().default('axiome-1'),
  COINFLIP_CONTRACT_ADDR: z.string().default(''),
  LAUNCH_CW20_ADDR: z.string().default(''),
  RELAYER_MNEMONIC: z.string().default(''),
  RELAYER_ADDRESS: z.string().default(''),
  TREASURY_ADDRESS: z.string().default(''),
  ADMIN_ADDRESSES: z.string().default(''),
  /** Secret key for HMAC session tokens. MUST be set in production (min 32 chars). */
  SESSION_SECRET: z.string().default('dev-session-secret-change-in-production'),
  /** Enable background sweep (auto-reveal, auto-cancel, orphan cleanup). Default: true in prod, false in dev. */
  ENABLE_BACKGROUND_SWEEP: z.string().default(process.env.NODE_ENV === 'production' ? 'true' : 'false'),
  /** Enable chain indexer (event polling). Default: true in prod, false in dev. */
  ENABLE_INDEXER: z.string().default(process.env.NODE_ENV === 'production' ? 'true' : 'false'),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;

/**
 * Validate that all critical environment variables are set.
 * Called at server startup — crashes the process if any are missing.
 * In dev mode, only warns (to allow partial local setups).
 */
export function validateProductionEnv(): void {
  const isProd = env.NODE_ENV === 'production';
  const required: Array<{ key: keyof typeof env; label: string }> = [
    { key: 'COINFLIP_CONTRACT_ADDR', label: 'CoinFlip smart contract address' },
    { key: 'LAUNCH_CW20_ADDR', label: 'COIN CW20 token contract address' },
    { key: 'RELAYER_MNEMONIC', label: 'Relayer wallet mnemonic' },
    { key: 'RELAYER_ADDRESS', label: 'Relayer wallet address' },
    { key: 'TREASURY_ADDRESS', label: 'Treasury wallet address' },
    { key: 'DATABASE_URL', label: 'PostgreSQL connection string' },
  ];

  const missing: string[] = [];

  for (const { key, label } of required) {
    const val = env[key];
    if (!val || val === '') {
      missing.push(`  - ${key} (${label})`);
    }
  }

  // Session secret must be strong in production
  if (isProd && env.SESSION_SECRET.length < 32) {
    missing.push('  - SESSION_SECRET (must be at least 32 characters in production)');
  }

  if (isProd && env.SESSION_SECRET === 'dev-session-secret-change-in-production') {
    missing.push('  - SESSION_SECRET (still using default dev secret — MUST be changed in production)');
  }

  if (missing.length > 0) {
    const msg = `\n⚠️  Missing critical environment variables:\n${missing.join('\n')}\n`;
    if (isProd) {
      console.error(msg);
      throw new Error('FATAL: Cannot start in production with missing critical env vars. Fix the environment and restart.');
    } else {
      console.warn(msg + '(Running in dev mode — continuing with defaults)\n');
    }
  }
}
