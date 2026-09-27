FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Общий движок сценариев: сервер пересчитывает им прохождения
WORKDIR /repo/packages/scenario-engine
COPY packages/scenario-engine/package*.json ./
RUN npm ci
COPY packages/scenario-engine/tsconfig.json ./
COPY packages/scenario-engine/src ./src
RUN npm run build

WORKDIR /repo/apps/api
COPY apps/api/package*.json ./
RUN npm ci
COPY apps/api/prisma ./prisma
RUN npx prisma generate
COPY apps/api/tsconfig.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
COPY apps/api/scripts ./scripts
RUN npm run build

# Сценарии и каталог нужны seed
COPY content /repo/content

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /repo /repo
WORKDIR /repo/apps/api
USER node
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run db:deploy && npm run start"]
