FROM node:22.19-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22.19-alpine

# CI 传入 --build-arg GIT_SHA=<commit>，/health 会原样返回，用于断言服务器跑的是本次部署的代码。
ARG GIT_SHA=unknown
ARG APP_VERSION=unknown

ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
ENV APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /var/lib/research-canvas/pi && chown -R node:node /app /var/lib/research-canvas
USER node

# alpine 没有 curl，用 node 自带 fetch 探活。PORT 与 config.ts 的默认值保持一致。
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 4100
CMD ["node", "dist/index.js"]
