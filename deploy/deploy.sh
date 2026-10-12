#!/usr/bin/env bash
# Roll the stack to an image tag, and roll back if it does not come up healthy.
#
#   ./deploy.sh <image-tag>      deploy that tag (CI passes the commit sha)
#   ./deploy.sh --rollback       redeploy the tag that was live before the last deploy
#
# Runs on the server, from /opt/novicetutor. State is two one-line files:
#   .image_tag        the tag currently deployed
#   .image_tag.prev   the one before it
set -euo pipefail

cd "$(dirname "$0")"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

current=""
[ -f .image_tag ] && current="$(cat .image_tag)"

if [ "${1:-}" = "--rollback" ]; then
  [ -f .image_tag.prev ] || { echo "No previous tag recorded; nothing to roll back to." >&2; exit 1; }
  target="$(cat .image_tag.prev)"
else
  target="${1:?usage: deploy.sh <image-tag> | --rollback}"
fi

up() {
  IMAGE_TAG="$1" docker compose pull --quiet web realtime
  IMAGE_TAG="$1" docker compose up -d --remove-orphans
  # A changed Caddyfile is picked up without dropping connections.
  IMAGE_TAG="$1" docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
}

container_health() {
  local id
  id="$(docker compose ps -q "$1" 2>/dev/null || true)"
  [ -n "$id" ] || { echo "missing"; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo "missing"
}

# Healthy = both containers report healthy AND the app can reach its database.
# /api/health returns HTTP 200 when healthy and HTTP 503 when the DB is unreachable.
healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ "$(container_health web)" = "healthy" ] && [ "$(container_health realtime)" = "healthy" ]; then
      if docker compose exec -T web node -e \
        "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
        return 0
      fi
    fi
    sleep 3
  done
  return 1
}

echo "==> Deploying ${target} (currently: ${current:-none})"
up "$target"

if healthy; then
  if [ "$target" != "$current" ]; then
    [ -n "$current" ] && echo "$current" > .image_tag.prev
    echo "$target" > .image_tag
  fi
  docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
  echo "==> ${target} is live and healthy."
  exit 0
fi

echo "!!! ${target} did not become healthy within ${HEALTH_TIMEOUT}s." >&2
docker compose ps >&2 || true
docker compose logs --tail=60 web realtime >&2 || true

if [ -n "$current" ] && [ "$current" != "$target" ]; then
  echo "==> Rolling back to ${current}" >&2
  up "$current"
  if healthy; then
    echo "==> Rolled back; ${current} is serving again." >&2
  else
    echo "!!! Rollback to ${current} is ALSO unhealthy. Manual attention needed." >&2
  fi
fi
exit 1
