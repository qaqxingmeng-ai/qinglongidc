#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: with-local-env.sh <command> [args...]" >&2
  exit 1
fi

ENV_FILE="${SERVERAI_FRONTEND_ENV_FILE:-$HOME/.config/serverai/frontend.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

exec "$@"
