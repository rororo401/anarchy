#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "run with: sudo bash deploy/native/install.sh" >&2
  exit 1
fi

APP_DIR=$(cd "$(dirname "$0")/../.." && pwd)
APP_USER=${SUDO_USER:-ubuntu}
STRFRY_VERSION=${STRFRY_VERSION:-1.1.0}
SECP256K1_VERSION=${SECP256K1_VERSION:-v0.7.0}

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "create $APP_DIR/.env from .env.example before running this installer" >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git nginx golang-go autoconf automake libtool make software-properties-common libssl-dev zlib1g-dev liblmdb-dev libflatbuffers-dev flatbuffers-compiler libzstd-dev debian-keyring debian-archive-keyring apt-transport-https
add-apt-repository -y ppa:ubuntu-toolchain-r/test
apt-get update
apt-get install -y g++-11

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

install -d -o "$APP_USER" -g "$APP_USER" /var/lib/anarchos /var/lib/anarchos/strfry-db
install -d /etc/anarchos
install -m 0644 "$APP_DIR/deploy/native/strfry.conf" /etc/anarchos/strfry.conf
install -m 0644 "$APP_DIR/deploy/native/nginx-relay.conf" /etc/nginx/sites-available/anarchos-relay
ln -sfn /etc/nginx/sites-available/anarchos-relay /etc/nginx/sites-enabled/anarchos-relay
rm -f /etc/nginx/sites-enabled/default
install -m 0644 "$APP_DIR/deploy/native/Caddyfile" /etc/caddy/Caddyfile
install -m 0600 "$APP_DIR/.env" /etc/anarchos/anarchos.env
cat >> /etc/anarchos/anarchos.env <<'EOF'
SQLITE_PATH=/var/lib/anarchos/anarchos.sqlite
INTERNAL_RELAY_URL=ws://127.0.0.1:7777
BLOCKED_PUBKEY_FILE=/var/lib/anarchos/blocked-pubkeys.txt
RELAY_DB_PATH=/var/lib/anarchos/strfry-db
EOF

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
git clone --branch "$SECP256K1_VERSION" --depth 1 https://github.com/bitcoin-core/secp256k1.git "$TEMP_DIR/secp256k1"
cd "$TEMP_DIR/secp256k1"
./autogen.sh
./configure --enable-module-schnorrsig --enable-module-extrakeys --disable-tests --disable-benchmark
make -j1
make install
ldconfig

git clone --branch "$STRFRY_VERSION" --depth 1 https://github.com/hoytech/strfry.git "$TEMP_DIR/strfry"
cd "$TEMP_DIR/strfry"
git submodule update --init
make setup-golpe
make CXX=g++-11 -j1
install -m 0755 strfry /usr/local/bin/strfry

cd "$APP_DIR"
go build -o /usr/local/bin/strfry-policy infra/relay-policy/main.go
npm ci
npm run build

for service in anarchos-web anarchos-indexer anarchos-relay; do
  sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__APP_USER__|$APP_USER|g" \
    "$APP_DIR/deploy/native/$service.service" > "/etc/systemd/system/$service.service"
done

mkdir -p /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/anarchos.conf <<'EOF'
[Service]
EnvironmentFile=/etc/anarchos/anarchos.env
EOF

nginx -t
systemctl daemon-reload
systemctl enable --now nginx anarchos-relay anarchos-indexer anarchos-web caddy
systemctl restart nginx anarchos-relay anarchos-indexer anarchos-web caddy

echo "native install complete"
echo "check services with: systemctl status anarchos-relay anarchos-indexer anarchos-web nginx caddy"
