# ── 開発（docker compose up） ─────────────────────────
FROM node:20-slim AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
CMD ["npm", "run", "dev"]

# ── 本番ビルド ─────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# /health がバージョンを返すために package.json を実行時に配置する
COPY --from=builder /app/package.json ./package.json
EXPOSE 4000 4001
CMD ["node", "dist/index.js"]
