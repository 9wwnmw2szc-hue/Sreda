#!/usr/bin/env bash
set -euo pipefail
umask 077
destination=${1:?Supply a private Russian Object Storage s3://bucket/prefix destination}
[[ "$destination" == s3://* ]] || { echo "Invalid backup destination"; exit 1; }
cd /opt/biznesoty/deploy
mkdir -p /opt/biznesoty/backups
backup="/opt/biznesoty/backups/biznesoty-$(date -u +%Y%m%dT%H%M%SZ).dump"
# User/db names must match deploy/db.env (biznesoty for new installs; legacy sreda on old VMs).
docker compose -f compose.yml exec -T db pg_dump -U biznesoty -d biznesoty -Fc > "$backup"
# Validate archive structure before reporting success. A restore drill is still required.
docker compose -f compose.yml exec -T db pg_restore --list < "$backup" > /dev/null
aws --endpoint-url=https://storage.yandexcloud.net s3 cp "$backup" "${destination%/}/$(basename "$backup")" --only-show-errors
printf '%s\n' "$backup"
