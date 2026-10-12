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

# Chained with && because this runs as an `if` condition, where `set -e` is
# off: a failed pull must not go on to recreate the stack.
up() {
  IMAGE_TAG="$1" docker compose pull --quiet web realtime &&
    IMAGE_TAG="$1" docker compose up -d --remove-orphans
}

container_health() {
  local id
  id="$(docker compose ps -q "$1" 2>/dev/null || true)"
  [ -n "$id" ] || { echo "missing"; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo "missing"
}

# Healthy = all three containers report healthy, the app can reach its
# database, AND Caddy accepts the Caddyfile on disk.
# /api/health returns HTTP 200 when healthy and HTTP 503 when the DB is unreachable.
# The reload is what picks up a changed Caddyfile without dropping
# connections; if Caddy rejects the file it keeps serving the old config, and
# the deploy is reported as failed rather than "live".
healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ "$(container_health web)" = "healthy" ] && [ "$(container_health realtime)" = "healthy" ] &&
      [ "$(container_health caddy)" = "healthy" ]; then
      if docker compose exec -T web node -e \
        "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" &&
        docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 3
  done
  return 1
}

echo "==> Deploying ${target} (currently: ${current:-none})"
if up "$target" && healthy; then
  if [ "$target" != "$current" ]; then
    [ -n "$current" ] && echo "$current" > .image_tag.prev
    echo "$target" > .image_tag
  fi
  # -a: every deploy leaves a tagged :<sha> image behind, which a plain prune
  # never removes. A rollback to a pruned tag re-pulls it from the registry.
  docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true
  echo "==> ${target} is live and healthy."
  exit 0
fi

echo "!!! ${target} failed to start or did not become healthy within ${HEALTH_TIMEOUT}s." >&2
docker compose ps >&2 || true
docker compose logs --tail=60 web realtime caddy >&2 || true

if [ -n "$current" ] && [ "$current" != "$target" ]; then
  echo "==> Rolling back to ${current}" >&2
  if up "$current" && healthy; then
    echo "==> Rolled back; ${current} is serving again." >&2
  else
    echo "!!! Rollback to ${current} is ALSO unhealthy. Manual attention needed." >&2
  fi
fi
exit 1
