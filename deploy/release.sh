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
  docker compose "${args[@]}" --profile telegram stop telegram-worker || true
fi
if grep -q '^VK_WEBHOOKS_ENABLED=true$' /opt/sreda/app.env; then
  args+=(--profile vk)
else
  docker compose "${args[@]}" --profile vk stop vk-worker || true
fi
# yc must be configured with the VM service account (registry viewer only).
yc iam create-token | docker login --username iam --password-stdin cr.yandex
# Migrations are forward-only. Rollback must use a schema-compatible image.
docker compose "${args[@]}" pull app
docker compose "${args[@]}" up -d db
docker compose "${args[@]}" run --rm migrate
docker compose "${args[@]}" up -d --remove-orphans
# 1) App must be up (web+DB). 2) If telegram/vk profiles are on, wait for full /api/health.
web_ok=0
for attempt in {1..30}; do
  if docker compose "${args[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health/web').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    web_ok=1
    break
  fi
  sleep 2
done
if [[ "$web_ok" -ne 1 ]]; then
  echo 'Web health check failed; inspect app/db and use a schema-compatible previous image'
  exit 1
fi
need_full=0
grep -q '^TELEGRAM_WEBHOOKS_ENABLED=true$' /opt/sreda/app.env && need_full=1
grep -q '^VK_WEBHOOKS_ENABLED=true$' /opt/sreda/app.env && need_full=1
if [[ "$need_full" -eq 1 ]]; then
  for attempt in {1..30}; do
    if docker compose "${args[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
      printf 'SREDA_IMAGE=%s\n' "$image" > /opt/sreda/deploy/.env
      echo 'Release is healthy (web + required workers)'
      exit 0
    fi
    sleep 2
  done
  echo 'Full health check failed; inspect telegram/vk workers and heartbeats'
  exit 1
fi
printf 'SREDA_IMAGE=%s\n' "$image" > /opt/sreda/deploy/.env
echo 'Release is healthy (web)'
exit 0
