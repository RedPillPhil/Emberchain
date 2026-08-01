# Emberchain api-server — bridge relayer, exchange, community APIs.
# Deploy to Railway, Fly.io, Render, or any always-on host (NOT Vercel).
#
# Build from repo root:
#   docker build -f artifacts/api-server/Dockerfile -t emberchain-api .
#
# Required runtime env:
#   PORT, DATABASE_URL, CHAIN_NODE_URL, READ_NODE_URL,
#   BRIDGE_RELAYER_PRIVATE_KEY, BASE_RPC_URL,
#   EMBER_BRIDGE_ADDRESS, EMBERCHAIN_BRIDGE_ADDRESS

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/artifacts/api-server/dist ./dist
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
