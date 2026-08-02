#!/usr/bin/env bash
# docker compose v2 plugin OR legacy docker-compose v1
compose() {
  if docker compose version &>/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose &>/dev/null; then
    docker-compose "$@"
  else
    echo "Install compose: apt install -y docker-compose-v2  OR  apt install -y docker-compose" >&2
    return 1
  fi
}
