# Server

The SpacetimeDB module. This package is not an HTTP server. `scripts/bootstrap.sh` publishes it with `spacetime publish --module-path server`.

Conventions: [../repo-conventions.md](../repo-conventions.md).

## Files

`src/index.ts` is the SpacetimeDB module: tables and reducers. `package.json` depends on `spacetimedb` `2.10.2` and exposes `typecheck` and `test`. `tsconfig.json` includes `src`.

`src/rules-by-type.ts` is the `rulesByType` registry. It starts empty. `registerGameRules` stores a shared `GameRules` value under that game's `GameDefinition.gameType`. Lookup is `rulesByType[gameType]`. An unregistered `gameType` is absent.

Tables, all `public: true`:

- `Lobby` — `id`, unique `code`, `status` (`open` | `closed`), `createdAt`
- `LobbyMember` — unique per lobby and `clientId` via `byLobbyAndClient`
- `GameTable` — `byLobby`, plus `gameType`, seat limits, `stateJson`
- `GameSeat` — `byTable`, optional `chips` and `seatState`
- `GameEvent` — `byTable`, `lobbyMemberId`, `type`, `payloadJson`, `createdAt`

Reducers: `create_lobby` (no arguments), `join_lobby` (`lobbyCode`, `clientId`, `name`), `create_game_table` (`lobbyId`, `gameType`, optional `settings`), `join_table` (`tableId`, `lobbyMemberId`), `leave_table` (`tableId`, `lobbyMemberId`), and `handle_game_intent` (`tableId`, `clientId`, `intentPayload`). `CaseConversionPolicy.None` keeps those names. The generated client calls `handle_game_intent` as `handleGameIntent`. Lobby codes are four characters from `CODE_ALPHABET` (no I, O, 0, 1).

## Changes

Edit `src/index.ts` for tables and reducers. Reject a bad call with `SenderError`. Keep table names PascalCase, columns camelCase, and reducer names snake_case.

Register a game in `src/rules-by-type.ts` with `GameRules` and `GameDefinition` from `src/shared/games`. Do not declare a second copy of those types.

Then publish and regenerate `client/src/module_bindings/`. `scripts/bootstrap.sh` is the path that already does this. Run `pnpm --filter server typecheck` after a type change.

`create_lobby` inserts a lobby and does not join the caller. `join_lobby` reuses a `LobbyMember` for the same `(lobbyId, clientId)` and updates the name. `create_game_table` inserts a `GameTable` in an open lobby with `status` `waiting_for_players`. Optional `settings` is a JSON object with `name`, `minPlayers`, and `maxPlayers`. `join_table` seats that member until `maxPlayers` is reached, inserting a `GameSeat` at the lowest free `seatIndex`. `leave_table` deletes that member's `GameSeat` at the table. The member stays in the lobby, and the other seats stay. `handle_game_intent` loads that table, resolves `LobbyMember` and `GameSeat` from `clientId`, looks up `rulesByType[gameType]`, deserializes `stateJson`, calls `rules.applyIntent`, and writes the new state back onto the `GameTable` row. That row update is what subscribers receive. After a successful apply it inserts one `GameEvent` for that table: `lobbyMemberId`, `type` from the intent, `createdAt`, and `payloadJson` holding the apply order and the intent. The event id ends in that order so a later replay can sort the table's rows. A rejected intent throws before the insert, so it adds no row. The module registers stub rules for gameType `stub`.

## Leave alone

Do not add a host flag. Every member is equal.

Do not listen on a port from this package. SpacetimeDB is started by the CLI in `scripts/bootstrap.sh`.

Do not keep lobby or table state only on the client. New authoritative rows belong in this module.
