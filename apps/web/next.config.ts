import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@coinflip/shared', '@coinflip/api-client'],
};

export default nextConfig;
