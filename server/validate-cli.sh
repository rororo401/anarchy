#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

SOURCE_ENV="$TEMP_DIR/source.env"
RUNTIME_ENV="$TEMP_DIR/runtime.env"
cat > "$SOURCE_ENV" <<'ENV'
WEB_DOMAIN=community.example.com
RELAY_DOMAIN=relay.example.com
NEXT_PUBLIC_RELAY_URL=wss://relay.example.com
PUBLIC_RELAY_URLS=wss://one.example.com/
ENV
cat > "$RUNTIME_ENV" <<'ENV'
INTERNAL_RELAY_URL=ws://127.0.0.1:7777
PUBLIC_RELAY_URLS=wss://one.example.com/
ENV

run_cli() {
  ANARCHY_APP_DIR="$ROOT" \
  ANARCHY_ENV_FILE="$SOURCE_ENV" \
  ANARCHY_RUNTIME_ENV_FILE="$RUNTIME_ENV" \
  ANARCHY_NO_RESTART=1 \
  bash "$ROOT/deploy/native/anarchy" "$@"
}

run_cli help | grep -q "Anarchy Relay command-line interface"
run_cli relay list | grep -q "wss://one.example.com"
run_cli relay add "wss://two.example.com/path/?ignored=yes#fragment"
grep -q '^PUBLIC_RELAY_URLS=wss://one.example.com,wss://two.example.com/path$' "$SOURCE_ENV"
grep -q '^PUBLIC_RELAY_URLS=wss://one.example.com,wss://two.example.com/path$' "$RUNTIME_ENV"
run_cli relay add "wss://two.example.com/path/" | grep -q "already configured"
[[ $(grep '^PUBLIC_RELAY_URLS=' "$SOURCE_ENV" | tr ',' '\n' | grep -c 'two.example.com') -eq 1 ]]
run_cli relay remove "wss://one.example.com"
grep -q '^PUBLIC_RELAY_URLS=wss://two.example.com/path$' "$SOURCE_ENV"
run_cli relay remove "wss://missing.example.com" | grep -q "is not configured"

if run_cli relay add "https://not-a-relay.example.com" >/dev/null 2>&1; then
  echo "non-WebSocket relay URL was accepted" >&2
  exit 1
fi
if run_cli relay add "wss://relay.example.com" >/dev/null 2>&1; then
  echo "the deployment's own public relay was accepted as a remote relay" >&2
  exit 1
fi

echo "cli validation: ok"
