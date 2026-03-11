import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Load env vars from monorepo root .env
const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const CHAIN_RPC_URL = process.env.NEXT_PUBLIC_CHAIN_RPC_URL || 'http://49.13.3.227:26657';
const CHAIN_REST_URL = process.env.NEXT_PUBLIC_CHAIN_REST_URL || 'http://49.13.3.227:1317';

const nextConfig: NextConfig = {
  transpilePackages: ['@coinflip/shared', '@coinflip/api-client'],
  async rewrites() {
    return [
      // Proxy chain REST API (LCD) to avoid CORS
      {
        source: '/chain-rest/:path*',
        destination: `${CHAIN_REST_URL}/:path*`,
      },
      // Proxy chain RPC to avoid CORS
      {
        source: '/chain-rpc/:path*',
        destination: `${CHAIN_RPC_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
