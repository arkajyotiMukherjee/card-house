#!/usr/bin/env bash
# Idempotent local setup: tools on /usr/local/bin, dependencies, SpacetimeDB, bindings.
# --deps-only installs tools and dependencies, then exits. It does not start servers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="full"
if [[ $# -gt 0 ]]; then
  case "$1" in
    --deps-only) MODE="deps" ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
fi

install_file() {
  local src="$1"
  local dest="$2"
  if [[ -w "$(dirname "$dest")" ]]; then
    install -m 755 "$src" "$dest"
  else
    sudo install -m 755 "$src" "$dest"
  fi
}

link_file() {
  local src="$1"
  local dest="$2"
  if [[ -w "$(dirname "$dest")" ]]; then
    ln -sfn "$src" "$dest"
  else
    sudo ln -sfn "$src" "$dest"
  fi
}

ensure_pnpm() {
  if [[ -x /usr/local/bin/pnpm ]]; then
    return
  fi
  local version="10.26.1"
  local tmp
  tmp="$(mktemp)"
  curl -fsSL "https://github.com/pnpm/pnpm/releases/download/v${version}/pnpm-linux-x64" -o "$tmp"
  install_file "$tmp" /usr/local/bin/pnpm
  rm -f "$tmp"
}

ensure_spacetime() {
  if [[ -x /usr/local/bin/spacetime ]]; then
    return
  fi
  curl -sSf https://install.spacetimedb.com | sh -s -- --yes
  if [[ ! -x "${HOME}/.local/bin/spacetime" ]]; then
    echo "SpacetimeDB CLI install did not produce ${HOME}/.local/bin/spacetime" >&2
    exit 1
  fi
  link_file "${HOME}/.local/bin/spacetime" /usr/local/bin/spacetime
}

port_open() {
  local host="$1"
  local port="$2"
  timeout 1 bash -c "echo >/dev/tcp/${host}/${port}" >/dev/null 2>&1
}

ensure_pnpm
ensure_spacetime
export PATH="/usr/local/bin:${PATH}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required on PATH to install dependencies and publish the module" >&2
  exit 1
fi

if [[ -f pnpm-lock.yaml ]]; then
  /usr/local/bin/pnpm install --frozen-lockfile
else
  /usr/local/bin/pnpm install
fi

if [[ "$MODE" == "deps" ]]; then
  exit 0
fi

HOST_URI="${SPACETIMEDB_HOST:-ws://127.0.0.1:3000}"
DB_NAME="${SPACETIMEDB_DB:-cardroom}"

rest="${HOST_URI#*://}"
hostport="${rest%%/*}"
db_host="${hostport%%:*}"
db_port="${hostport##*:}"
if [[ "$db_port" == "$hostport" ]]; then
  db_port="3000"
fi

case "$db_host" in
  127.0.0.1 | localhost) local_db=1 ;;
  *) local_db=0 ;;
esac

if [[ "$local_db" == 1 ]]; then
  server_arg="local"
  if port_open "$db_host" "$db_port"; then
    echo "SpacetimeDB already listening on ${db_host}:${db_port}"
  else
    echo "Starting SpacetimeDB on 0.0.0.0:${db_port}"
    nohup /usr/local/bin/spacetime start \
      --listen-addr "0.0.0.0:${db_port}" \
      --non-interactive \
      >> /tmp/cardroom-spacetime.log 2>&1 &
    disown || true
  fi
else
  server_arg="$HOST_URI"
  echo "SPACETIMEDB_HOST is not local; not starting a local server"
fi

ready=0
for _ in $(seq 1 60); do
  if /usr/local/bin/spacetime server ping "$server_arg" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo "SpacetimeDB did not respond to ping (${server_arg})" >&2
  if [[ -f /tmp/cardroom-spacetime.log ]]; then
    tail -n 40 /tmp/cardroom-spacetime.log >&2 || true
  fi
  exit 1
fi

/usr/local/bin/spacetime publish \
  --server "$server_arg" \
  --module-path "$ROOT/server" \
  --yes \
  "$DB_NAME"

mkdir -p "$ROOT/client/src/module_bindings"
/usr/local/bin/spacetime generate \
  --lang typescript \
  --out-dir "$ROOT/client/src/module_bindings" \
  --module-path "$ROOT/server" \
  --yes
