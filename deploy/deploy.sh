#!/usr/bin/env bash
#
# Pulls the latest release and applies it. Nothing is built on this machine.
#
#   cd deploy && ./deploy.sh
#   cd deploy && ./deploy.sh --force    # apply even without a new commit
#
# Meant to run from cron every few minutes, like SHD-Finance-Flow's deploy.sh.
# With no new commit on origin/main it exits silently without touching anything.
#
# The GHCR package is private. Its read token lives in a Docker config dir of
# its own (deploy/.docker), NOT ~/.docker: that file holds one credential per
# registry, and its ghcr.io slot belongs to SHD-Finance-Flow's auto-deploy.
# Logging in there would silently replace SHD's token and break its deploys.
#
# One-time login (see DEPLOY.md):
#   DOCKER_CONFIG=$PWD/.docker docker login ghcr.io -u <user> --password-stdin

set -euo pipefail
cd "$(dirname "$0")"

export DOCKER_CONFIG="$PWD/.docker"
mkdir -p "$DOCKER_CONFIG"
chmod 700 "$DOCKER_CONFIG"
# A per-user compose plugin lives in ~/.docker/cli-plugins; keep it reachable.
if [ -d "$HOME/.docker/cli-plugins" ] && [ ! -e "$DOCKER_CONFIG/cli-plugins" ]; then
  ln -s "$HOME/.docker/cli-plugins" "$DOCKER_CONFIG/cli-plugins"
fi

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

log() { printf '%s %s\n' "$(date -Is)" "$*"; }

# One deploy at a time: cron and a manual --force run must not recreate the
# same container concurrently.
exec 9>/tmp/mysimoka-admin-deploy.lock
if ! flock -n 9; then
  log "another deploy is running, skipping"
  exit 0
fi

[ -f .env ] || { log "deploy/.env missing (copy .env.example)"; exit 1; }

# ── New release? ──────────────────────────────────────────────────────────────
git fetch --quiet origin main
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"

if [ "$local_sha" = "$remote_sha" ] && [ "$FORCE" -eq 0 ]; then
  exit 0
fi
log "release: ${local_sha:0:8} -> ${remote_sha:0:8}"

# Pull by commit SHA, not the moving `main` tag: cron can fire before CI has
# pushed the new image, and `main` would still be the previous build.
# Environment variables win over .env in Compose.
export IMAGE_TAG="$remote_sha"

# Pull FIRST, merge later. If the pull fails with HEAD already moved, the next
# cron run sees local == origin and never retries.
if ! pull_err="$(docker compose pull --quiet 2>&1)"; then
  if grep -qiE 'denied|unauthorized' <<<"$pull_err"; then
    log "FAILED: ghcr.io refused the pull; token in deploy/.docker missing or expired"
    exit 1
  fi
  log "image ${remote_sha:0:8} not in registry yet (CI still building?); will retry"
  exit 0
fi

git merge --ff-only --quiet origin/main

log "applying"
docker compose up -d --remove-orphans

# Keep .env pointing at what is actually running, for manual `docker compose`.
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${remote_sha}|" .env

# Remove this project's older release images only. Never `prune -a`: other
# stacks on this server have images without running containers.
cleanup_old_images() {
  local image
  image="$(sed -n 's/^[[:space:]]*IMAGE[[:space:]]*=[[:space:]]*//p' .env | tail -n 1 | tr -d '\015')"
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep -E "^${image}:" \
    | grep -v ":${remote_sha}\$" \
    | xargs -r docker rmi >/dev/null 2>&1 || true
  log "old release images removed"
}

# ── Wait until healthy ─────────────────────────────────────────────────────────
# `up -d` returns when the container exists, not when it serves.
for _ in $(seq 1 20); do
  status="$(docker inspect --format '{{.State.Health.Status}}' mysimoka-admin 2>/dev/null || echo starting)"
  [ "$status" = "healthy" ] && { log "healthy on ${remote_sha:0:8}"; cleanup_old_images; exit 0; }
  [ "$status" = "unhealthy" ] && break
  sleep 3
done

log "FAILED: mysimoka-admin not healthy after deploy ${remote_sha:0:8}"
docker compose logs --tail 40 admin >&2
exit 1
