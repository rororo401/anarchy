#!/usr/bin/env bash
set -euo pipefail

APP_DIR=$(cd "$(dirname "$0")/../.." && pwd)
set -a
source /etc/anarchos/anarchos.env
set +a
cd "$APP_DIR"
exec npm run admin -- "$@"
