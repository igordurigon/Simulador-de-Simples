# Estágio 1: instala tudo, testa e compila (front com Vite, servidor com tsc)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vitest run && npm run build

# Estágio 2: só as dependências de produção
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Estágio 3: imagem final (Node + dependências de produção + front + servidor compilado)
FROM node:24-alpine
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
# /data guarda o SQLite; o volume herda o dono do diretório na primeira criação
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/saude || exit 1
CMD ["node", "server/dist/index.js"]
