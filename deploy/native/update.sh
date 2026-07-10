#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "run with: sudo bash deploy/native/update.sh" >&2
  exit 1
fi

APP_DIR=$(cd "$(dirname "$0")/../.." && pwd)
cd "$APP_DIR"
npm ci
npm run build
install -m 0600 .env /etc/anarchos/anarchos.env
cat >> /etc/anarchos/anarchos.env <<'EOF'
SQLITE_PATH=/var/lib/anarchos/anarchos.sqlite
INTERNAL_RELAY_URL=ws://127.0.0.1:7777
BLOCKED_PUBKEY_FILE=/var/lib/anarchos/blocked-pubkeys.txt
RELAY_DB_PATH=/var/lib/anarchos/strfry-db
EOF
systemctl restart anarchos-indexer anarchos-web caddy
echo "native update complete"
