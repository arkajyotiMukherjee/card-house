# Scripts

`bootstrap.sh` is the local setup. It is safe to run again.

Conventions: [../repo-conventions.md](../repo-conventions.md).

## What it does

1. Puts `pnpm` `10.26.1` and the `spacetime` CLI on `/usr/local/bin`. Login shells do not load `~/.bashrc`, so the script does not rely on `~/.local/bin` alone.
2. Runs `pnpm install --frozen-lockfile` when the lockfile exists.
3. Starts a local SpacetimeDB when `SPACETIMEDB_HOST` is loopback and that port is closed. Default host is `ws://127.0.0.1:3000`. If the port is open, it leaves the running server alone.
4. Publishes `server/` to `SPACETIMEDB_DB` (default `cardroom`).
5. Generates `client/src/module_bindings/`.

`--deps-only` stops after steps 1 and 2. `.cursor/environment.json` uses that for install, and the full script as `start` before `pnpm dev`.

A non-local `SPACETIMEDB_HOST` is pinged and published to. The script does not start a local server in that case.

## Changes

Keep the script idempotent. New setup steps belong here if every agent environment needs them. `set -euo pipefail` stays.

Publish and generate stay in this script so client bindings match `server/src/index.ts`.

## Leave alone

Do not commit an auth token. Do not point the default host at a hosted database.

Do not kill a SpacetimeDB that is already listening. `port_open` is the guard.
