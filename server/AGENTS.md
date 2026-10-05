# Server

The SpacetimeDB module. This package is not an HTTP server. `scripts/bootstrap.sh` publishes it with `spacetime publish --module-path server`.

Conventions: [../repo-conventions.md](../repo-conventions.md).

## Files

`src/index.ts` is the whole module. `package.json` depends on `spacetimedb` `2.10.2` and exposes `typecheck`. `tsconfig.json` includes `src` only.

`src/` is that one file, so this guide covers it.

Tables, all `public: true`:

- `Lobby` — `id`, unique `code`, `status` (`open` | `closed`), `createdAt`
- `LobbyMember` — unique per lobby and `clientId` via `byLobbyAndClient`
- `GameTable` — `byLobby`, plus `gameType`, seat limits, `stateJson`
- `GameSeat` — `byTable`, optional `chips` and `seatState`
- `GameEvent` — `byTable`, `lobbyMemberId`, `type`, `payloadJson`, `createdAt`

Reducers: `create_lobby` (no arguments), `join_lobby` (`lobbyCode`, `clientId`, `name`), `create_game_table` (`lobbyId`, `gameType`, optional `settings`), and `join_table` (`tableId`, `lobbyMemberId`). `CaseConversionPolicy.None` keeps those names. Lobby codes are four characters from `CODE_ALPHABET` (no I, O, 0, 1).

## Changes

Edit `src/index.ts`. Reject a bad call with `SenderError`. Keep table names PascalCase, columns camelCase, and reducer names snake_case.

Then publish and regenerate `client/src/module_bindings/`. `scripts/bootstrap.sh` is the path that already does this. Run `pnpm --filter server typecheck` after a type change.

`create_lobby` inserts a lobby and does not join the caller. `join_lobby` reuses a `LobbyMember` for the same `(lobbyId, clientId)` and updates the name. `create_game_table` inserts a `GameTable` in an open lobby with `status` `waiting_for_players`. Optional `settings` is a JSON object with `name`, `minPlayers`, and `maxPlayers`. `join_table` seats that member until `maxPlayers` is reached, inserting a `GameSeat` at the lowest free `seatIndex`.

## Leave alone

Do not add a host flag. Every member is equal.

Do not listen on a port from this package. SpacetimeDB is started by the CLI in `scripts/bootstrap.sh`.

Do not keep lobby or table state only on the client. New authoritative rows belong in this module.
