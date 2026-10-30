# Sovra API. Build from backend/: `docker build -t sovra-backend .`
# The image holds no secrets: every key comes from the environment at run time (see .env.example).

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8787
WORKDIR /app
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --chown=root:root package.json ./
COPY --chown=root:root drizzle ./drizzle
# Files stay owned by root, so the app can't change its own code.
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Migrations run (once, under an advisory lock) before the server starts taking requests.
# Set RUN_MIGRATIONS=false when the platform runs `node dist/scripts/migrate.js` as a pre-deploy step.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" != false ]; then node dist/scripts/migrate.js || exit 1; fi; exec node dist/main.js"]
