# Use Node.js 22 as the base image
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Stage 1: Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# We need DATABASE_URL for prisma generate if it's not set in env, 
# but usually it's just for the client generation which doesn't strictly need a live DB if schemas are fine.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm prisma generate
RUN NODE_OPTIONS=--max-old-space-size=8192 pnpm build

# Stage 3: Production image
FROM base AS runner
ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/cli ./cli
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/start.sh ./start.sh

# Make start.sh executable
RUN chmod +x ./start.sh

# Expose the port the app runs on
EXPOSE 3000

# Default command
CMD ["./start.sh"]
