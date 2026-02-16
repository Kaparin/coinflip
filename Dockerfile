FROM node:22-alpine

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.6.4 --activate

WORKDIR /app

# Copy workspace config files first (for dependency layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy ALL workspace package.json files for pnpm lockfile resolution
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY tooling/openapi/package.json ./tooling/openapi/
COPY scripts/package.json ./scripts/

# Install all dependencies (cached layer)
RUN pnpm install --frozen-lockfile

# Copy source code for API and its workspace dependencies
COPY apps/api/ ./apps/api/
COPY packages/db/ ./packages/db/
COPY packages/shared/ ./packages/shared/
COPY packages/tsconfig/ ./packages/tsconfig/
COPY tooling/openapi/openapi.json ./tooling/openapi/openapi.json

# Railway sets PORT env var; expose a default
EXPOSE ${PORT:-3001}

# Run with tsx to handle TypeScript workspace packages at runtime
CMD ["pnpm", "--filter", "@coinflip/api", "start"]
