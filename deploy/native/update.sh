#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "run with: sudo bash deploy/native/update.sh" >&2
  exit 1
fi

APP_DIR=$(cd "$(dirname "$0")/../.." && pwd)
APP_USER=${APP_USER:-${SUDO_USER:-}}
if [[ -z "$APP_USER" && -f /etc/systemd/system/anarchos-web.service ]]; then
  APP_USER=$(sed -n 's/^User=//p' /etc/systemd/system/anarchos-web.service | head -n 1)
fi
APP_USER=${APP_USER:-ubuntu}
cd "$APP_DIR"
npm ci
npm run build
install -d /etc/anarchos
printf '%s\n' "$APP_DIR" > /etc/anarchos/app-dir
chmod 0644 /etc/anarchos/app-dir
install -m 0755 deploy/native/anarchy /usr/local/bin/anarchy
install -m 0644 deploy/native/strfry.conf /etc/anarchos/strfry.conf
install -m 0600 .env /etc/anarchos/anarchos.env
cat >> /etc/anarchos/anarchos.env <<'EOF'
SQLITE_PATH=/var/lib/anarchos/anarchos.sqlite
INTERNAL_RELAY_URL=ws://127.0.0.1:7777
BLOCKED_PUBKEY_FILE=/var/lib/anarchos/blocked-pubkeys.txt
RELAY_DB_PATH=/var/lib/anarchos/strfry-db
EOF
for service in anarchos-web anarchos-indexer anarchos-relay; do
  sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__APP_USER__|$APP_USER|g" \
    "$APP_DIR/deploy/native/$service.service" > "/etc/systemd/system/$service.service"
done
systemctl daemon-reload
systemctl restart anarchos-relay anarchos-indexer anarchos-web caddy
echo "Anarchy Relay native update complete"
echo "run: anarchy help"
