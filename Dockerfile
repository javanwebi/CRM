FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @crm/api exec prisma generate --schema ../../packages/database/schema.prisma
RUN pnpm build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node","--import","tsx","apps/api/src/server.ts"]
