# Docs

The plan for the card room. These files describe scenes, drivers, and games the code does not implement yet.

Conventions: [../repo-conventions.md](../repo-conventions.md).

## Files

- `architecture.md` — lobby, tables, seats, client vs SpacetimeDB, future `GameRules` and `GameDriver` shapes.
- `implementation.md` — milestone order from the skeleton through more games and Discord.
- `ui-ux.md` — in-canvas layout, 960×540, integer scaling, pixel buttons.

Prettier ignores `docs/`. Match the plain markdown already in these files.

## Changes

Update a doc when you change the plan it describes. Keep names aligned with the module when you write about something that already exists: tables are `Lobby`, `LobbyMember`, `GameTable`, `GameSeat`, and `GameEvent`; reducers in the module are `create_lobby`, `join_lobby`, `create_game_table`, `join_table`, `leave_table`, and `handle_game_intent`.

The running code is the check for current behavior. `architecture.md` still lists Discord and per-game rules that are not in `server/src/index.ts`. `handle_game_intent` appends a `GameEvent` after each applied intent.

## Leave alone

Do not paste the Pixel Poker Pack, its raw files, or a long license reprint into these docs. The pack stays in `card-assest -pack`, and the privacy rule is in `README.md` and `repo-conventions.md`.

Do not treat `client/src/module_bindings/` as hand-written API. It is generated from the module.
