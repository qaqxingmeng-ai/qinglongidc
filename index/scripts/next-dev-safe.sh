#!/usr/bin/env bash
set -euo pipefail

if [ -x /opt/homebrew/opt/node@22/bin/node ]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

ENV_FILE="${SERVERAI_FRONTEND_ENV_FILE:-$HOME/.config/serverai/frontend.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

exec next dev "$@"
