# Frontend Next.js en modo standalone.
# Se construye desde la carpeta frontend:
#   docker build -t inventario-bell-frontend ./frontend
#
# NEXT_PUBLIC_API_URL se incrusta en el build: si cambia, hay que reconstruir.

FROM node:22-alpine AS base
# Next.js usa binarios nativos; libc6-compat evita fallos en Alpine.
RUN apk add --no-cache libc6-compat

# -------------------------
# Dependencias
# -------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# -------------------------
# Build
# -------------------------
FROM base AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    DOCKER_BUILD=1 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# -------------------------
# Imagen final
# -------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

# El build standalone incluye solo lo necesario para ejecutar el servidor.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
