FROM node:22-bookworm-slim AS build
# Движок подключается к приложению из исходников через alias в vite.config.ts
WORKDIR /repo
COPY packages/scenario-engine/src ./packages/scenario-engine/src
WORKDIR /repo/apps/pwa
COPY apps/pwa/package*.json ./
RUN npm ci
COPY apps/pwa/tsconfig.json apps/pwa/vite.config.ts apps/pwa/index.html ./
COPY apps/pwa/public ./public
COPY apps/pwa/src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY infra/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/pwa/dist /usr/share/nginx/html
EXPOSE 80
