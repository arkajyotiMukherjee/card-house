# Server

The SpacetimeDB module. This package is not an HTTP server. `scripts/bootstrap.sh` publishes it with `spacetime publish --module-path server`.

Conventions: [../repo-conventions.md](../repo-conventions.md).

## Files

`src/index.ts` is the SpacetimeDB module: tables and reducers. `package.json` depends on `spacetimedb` `2.10.2` and exposes `typecheck` and `test`. `tsconfig.json` includes `src`.

`src/rules-by-type.ts` is the `rulesByType` registry. It starts empty. `registerGameRules` stores a shared `GameRules` value under that game's `GameDefinition.gameType`. Lookup is `rulesByType[gameType]`. An unregistered `gameType` is absent. `src/opening-state.ts` asks that registry for `initialState` when a table is created. `src/table-status.ts` maps a stored `phase` onto the table status and leaves a state with no phase unchanged. The dummy counter rules live in `src/shared/games/dummy-counter.ts`. Bluff rules live in `src/shared/games/bluff.ts`. President rules live in `src/shared/games/president.ts`. Go Fish rules live in `src/shared/games/go-fish.ts`. Crazy Eights rules live in `src/shared/games/crazy-eights.ts`. Rummy rules live in `src/shared/games/rummy.ts`. Blackjack rules live in `src/shared/games/blackjack.ts`. `src/bluff.test.ts` checks a six-seat deal, an empty table, a legal play, a rejected turn, a last-card win, and the event notes. `src/president.test.ts` checks a six-seat deal, a stable shuffle, a legal play, rejected turns and ranks, a cleared trick, scoring, and the end of the hand. `src/go-fish.test.ts` checks a deal, a shuffle, a legal ask, a rejected turn, scoring, and the end of the game. `src/crazy-eights.test.ts` checks a deal, a legal play, a rejected move, a wild eight, a draw, scoring, and both end conditions. `src/rummy.test.ts` checks a deal, a legal draw and meld, a rejected turn, an illegal run, a layoff, scoring, and both end conditions. `src/blackjack.test.ts` checks the shoe, bets, legal and illegal moves, scoring, and the end of a round.

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

`create_lobby` inserts a lobby and does not join the caller. `join_lobby` reuses a `LobbyMember` for the same `(lobbyId, clientId)` and updates the name. `create_game_table` inserts a `GameTable` in an open lobby with `status` `waiting_for_players`. Optional `settings` is a JSON object with `name`, `minPlayers`, and `maxPlayers`. When `rulesByType` has that `gameType`, `stateJson` is `initialState`. Otherwise it is `{}`. `join_table` seats that member until `maxPlayers` is reached, inserting a `GameSeat` at the lowest free `seatIndex`. After that insert, if the parsed `stateJson` is still `phase: "lobby"` and the seated count is at least `minPlayers`, `stateJson` is replaced with `rules.initialState` for the current seats and the table status follows that phase (`play` becomes `in_progress`). Dummy `{ count }` and stub `{ label }` have no lobby phase, so those tables stay as they were. `leave_table` deletes that member's `GameSeat` at the table. The member stays in the lobby, and the other seats stay. `handle_game_intent` loads that table, resolves `LobbyMember` and `GameSeat` from `clientId`, looks up `rulesByType[gameType]`, deserializes `stateJson`, calls `rules.applyIntent`, and writes the new state back onto the `GameTable` row. A stored `phase` of `finished` sets that row's status to `finished`. A state with no `phase` keeps the previous status. That row update is what subscribers receive. After a successful apply it inserts one `GameEvent` for that table: `lobbyMemberId`, `type` from the intent, `createdAt`, and `payloadJson` holding the apply order and the intent, plus a `note` when the game's optional `rules.eventNote` returns one (Bluff does for a play and a challenge, President does for a play, a pass, and the finish, Go Fish does for an ask, Crazy Eights does for a play, a draw, a pass, and the finish, Rummy does for a draw, meld, layoff, or discard, and Blackjack does for a bet, hit, stand, double, or split; dummy and stub have none). The event id ends in that order so a later replay can sort the table's rows. A rejected intent throws before the insert, so it adds no row. The module registers stub rules for gameType `stub`, counter rules for gameType `dummy` (`{ count }` plus an `increment` intent), Bluff rules for gameType `bluff`, President rules for gameType `president`, Go Fish rules for gameType `go_fish`, Crazy Eights rules for gameType `crazy_eights`, Rummy rules for gameType `rummy`, and Blackjack rules for gameType `blackjack`.

## Leave alone

Do not add a host flag. Every member is equal.

Do not listen on a port from this package. SpacetimeDB is started by the CLI in `scripts/bootstrap.sh`.

Do not keep lobby or table state only on the client. New authoritative rows belong in this module.
