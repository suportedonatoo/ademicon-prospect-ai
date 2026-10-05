# Ademicon Prospect AI — imagem única para app (Next.js) e worker (BullMQ).
# Build:  docker build -t prospect-ai .
# Subir tudo: docker compose --profile full up -d --build

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# O build só precisa de uma URL sintaticamente válida; nenhuma conexão é feita. Valores reais vêm do ambiente em runtime.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 1001 --home /app prospect
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3500
# node_modules completo: o worker usa tsx e o container aplica as migrations com o Prisma CLI.
COPY --from=build --chown=prospect /app/node_modules ./node_modules
COPY --from=build --chown=prospect /app/.next ./.next
COPY --from=build --chown=prospect /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=prospect /app/prisma ./prisma
COPY --from=build --chown=prospect /app/src ./src
# scripts operacionais (ex.: scripts/preparar-piloto.ts, rodado com docker compose exec)
COPY --from=build --chown=prospect /app/scripts ./scripts
RUN mkdir -p /app/storage && chown prospect /app/storage
USER prospect
EXPOSE 3500
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3500/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3500"]
