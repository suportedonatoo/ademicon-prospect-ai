# Serviço de Landing Pages das PJs — não acessa banco; fala só com a API do sistema de gestão.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN useradd --system --uid 1001 --home /app landing
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=landing /app/node_modules ./node_modules
COPY --from=build --chown=landing /app/.next ./.next
COPY --from=build --chown=landing /app/package.json /app/next.config.ts ./
USER landing
EXPOSE 3600
CMD ["npx", "next", "start", "-p", "3600"]
