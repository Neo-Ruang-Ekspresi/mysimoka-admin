# Deploy admin.mysimoka.id

Same model as `mysimoka-web` on the same server: CI builds the image and publishes it to GHCR;
the server pulls it itself via `deploy/deploy.sh` from cron. GitHub holds no server credentials.

| What | Value |
|------|-------|
| Host | `43.163.117.147`, user `ubuntu` |
| Repo clone | `/home/ubuntu/mysimoka-admin` (stack in `deploy/`, `.env` there) |
| Image | `ghcr.io/neo-ruang-ekspresi/mysimoka-admin:<commit sha>` |
| Container | `mysimoka-admin` (compose project `mysimoka-admin`), port `8080`, no host port |
| Reverse proxy | `nginx` container on network `nginx_net`, owns 80/443 |
| Vhost | `/home/ubuntu/app/nginx/conf.d/admin.mysimoka.id.conf` (source: `deploy/admin.mysimoka.id.conf`) |
| DNS | wildcard `*` A → `43.163.117.147` already covers `admin.mysimoka.id` |

Backend URLs (`VITE_*`) are baked in at build time; defaults in `Dockerfile`.

## 0. Backend prerequisite: CORS

The browser calls auth + Hasura from origin `https://admin.mysimoka.id`. Both must allow it,
otherwise the page loads but login fails:

- Hasura: add `https://admin.mysimoka.id` to `HASURA_GRAPHQL_CORS_DOMAIN`.
- Auth service (`auth.mysimoka.sunhouse.co.id`): allow the same origin.

## 1. GHCR read token

Push to `main` → the `CI` workflow publishes the image. The package is private by default.
Create a **classic** PAT (scope **`read:packages`** only) on an account that can read packages of the `Neo-Ruang-Ekspresi` org, e.g. `whois-arvian`.

Do **not** `docker login` in `~/.docker` (its `ghcr.io` slot belongs to other stacks);
`deploy.sh` uses its own config dir `deploy/.docker`.

## 2. Server setup (once)

```bash
cd /home/ubuntu
git clone https://github.com/Neo-Ruang-Ekspresi/mysimoka-admin.git   # private repo: use a deploy key or token
cd mysimoka-admin/deploy
cp .env.example .env
mkdir -m 700 .docker
DOCKER_CONFIG=$PWD/.docker docker login ghcr.io -u whois-arvian --password-stdin   # paste token, Ctrl-D
./deploy.sh --force
```

Check:
```bash
docker ps --filter name=mysimoka-admin      # (healthy)
docker run --rm --network nginx_net busybox wget -qO- http://mysimoka-admin:8080/healthz   # ok
```

## 3. Auto-deploy (cron)

```bash
crontab -e
*/2 * * * * /home/ubuntu/mysimoka-admin/deploy/deploy.sh >> /home/ubuntu/log/mysimoka-admin-deploy.log 2>&1
```

## 4. Vhost + TLS (once)

Certificate via **webroot** (no nginx downtime), like `mysimoka.id`. nginx refuses to load a
vhost whose certificate is missing, so issue it before enabling the 443 block.

```bash
cd /home/ubuntu/app/nginx

# 4a) HTTP-only vhost for the ACME challenge
cat > conf.d/admin.mysimoka.id.conf <<'CONF'
server {
    listen 80;
    listen [::]:80;
    server_name admin.mysimoka.id;
    location /.well-known/acme-challenge/ { root /etc/letsencrypt/webroot; }
    location / { return 404; }
}
CONF
docker exec nginx nginx -t && docker exec nginx nginx -s reload

# 4b) issue the certificate
docker run --rm \
  -v /home/ubuntu/app/nginx/letsencrypt:/etc/letsencrypt \
  -v /home/ubuntu/log/letsencrypt:/var/log/letsencrypt \
  certbot/certbot:latest certonly --webroot -w /etc/letsencrypt/webroot \
  --cert-name admin.mysimoka.id -d admin.mysimoka.id \
  --email <admin-email> --agree-tos --no-eff-email

# 4c) full vhost, then reload
cp /home/ubuntu/mysimoka-admin/deploy/admin.mysimoka.id.conf conf.d/admin.mysimoka.id.conf
docker exec nginx nginx -t && docker exec nginx nginx -s reload
```

Check: `curl -I https://admin.mysimoka.id` → `200`.

## 5. Renewal

Add `admin.mysimoka.id` to the webroot loop ("Fase 1b") in
`/usr/local/bin/renew-rentalize-cert.sh`, next to `mysimoka.id`:

```bash
for cert in mysimoka.id admin.mysimoka.id; do
```

## Operations

```bash
cd /home/ubuntu/mysimoka-admin/deploy
export DOCKER_CONFIG=$PWD/.docker
tail -f /home/ubuntu/log/mysimoka-admin-deploy.log
docker compose ps && docker compose logs -f
```

Rollback: set `IMAGE_TAG=<older sha>` in `deploy/.env`, then `docker compose pull && docker compose up -d`.
