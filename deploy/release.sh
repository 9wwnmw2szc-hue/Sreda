#!/usr/bin/env bash
set -euo pipefail
cd /opt/sreda
image=${1:?Immutable registry image is required}
[[ "$image" =~ ^cr\.yandex/[a-z0-9]+/sreda:[a-f0-9]{40}$ ]] || { echo 'Invalid image'; exit 1; }
export SREDA_IMAGE="$image"
args=(-f /opt/sreda/deploy/compose.yml)
if grep -q '^TELEGRAM_WEBHOOKS_ENABLED=true$' /opt/sreda/app.env; then
  args+=(--profile telegram)
else
  docker compose "${args[@]}" --profile telegram stop worker || true
fi
# yc must be configured with the VM service account (registry viewer only).
yc iam create-token | docker login --username iam --password-stdin cr.yandex
# Migrations are forward-only. Rollback must use a schema-compatible image.
docker compose "${args[@]}" pull app
docker compose "${args[@]}" up -d db
docker compose "${args[@]}" run --rm migrate
docker compose "${args[@]}" up -d --remove-orphans
for attempt in {1..30}; do
  if docker compose "${args[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    printf 'SREDA_IMAGE=%s\n' "$image" > /opt/sreda/deploy/.env
    echo 'Release is healthy'
    exit 0
  fi
  sleep 2
done
echo 'Health check failed; inspect service health and use a schema-compatible previous image'
exit 1
