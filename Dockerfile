# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Variabel VITE_* di-inline saat build (bukan runtime).
# Relatif: diproksikan oleh deploy/nginx.conf (location /_auth/), tanpa CORS.
ARG VITE_AUTH_BASE_URL=/_auth
ARG VITE_API_BASE_URL=https://api.mysimoka.sunhouse.co.id
ARG VITE_GRAPHQL_URL=https://hasura.mysimoka.sunhouse.co.id/v1/graphql
ARG VITE_ENABLE_SUPERADMIN_PREVIEW=false
ENV VITE_AUTH_BASE_URL=$VITE_AUTH_BASE_URL \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GRAPHQL_URL=$VITE_GRAPHQL_URL \
    VITE_ENABLE_SUPERADMIN_PREVIEW=$VITE_ENABLE_SUPERADMIN_PREVIEW

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- serve ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

LABEL org.opencontainers.image.title="mysimoka-admin"

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Config nginx salah → build gagal, deploy.sh berhenti sebelum mengganti container.
RUN nginx -t

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
