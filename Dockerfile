FROM node:22-alpine

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.6.4 --activate

WORKDIR /app

# Copy everything (filtered by .dockerignore)
COPY . .

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Expose port (Railway sets PORT dynamically)
EXPOSE ${PORT:-3001}

# Run API server with tsx (handles TypeScript workspace packages)
CMD ["pnpm", "--filter", "@coinflip/api", "start"]
