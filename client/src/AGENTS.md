# Client source

TypeScript for the Excalibur client. One folder holds the engine, the boot scene, sprite atlases, and the database connection. Tests sit next to the unit they check.

Style, resolution, and pixel filtering: [../../repo-conventions.md](../../repo-conventions.md). Generated bindings: [module_bindings/AGENTS.md](module_bindings/AGENTS.md).

## Files

- `main.ts` — reads or creates `clientId`, then the engine at 960×540, fixed display, integer scale, loader, and `connectCardroom`. After the lobby subscription applies, it mounts the lobby panel, `LobbyScene`, and `GameScene` with that `clientId`. Joining a table opens `GameScene`. Leave returns to the lobby.
- `client-id.ts` — `getOrCreateClientId` reads `clientId` from `localStorage` or stores a new UUID. The key name is `clientId`.
- `boot-scene.ts` — boot scene. Draws the green table, two hearts, the card back, one chip, and a status line.
- `sheets.ts` — pixel sizes and grid math (`CARD_SIZE` 64, chip 32×44, table 129×80, logical 960×540).
- `card-atlas.ts` — `{ rank, suit }` to a sprite. Hearts only. Other suits throw.
- `chip-atlas.ts` — color or table value to a face sprite and a stack sprite on `chips-no-outline.png`.
- `table-atlas.ts` — `green`, `purple`, or `red` to a table sprite. Green is the default.
- `connect.ts` — `DbConnection.builder()`, the status string, and the `Lobby`, `LobbyMember`, and `GameTable` subscription. `subscribeLobbyTables` adds `GameTable` and `GameSeat` for one lobby. Host and database come from `__SPACETIMEDB_HOST__` and `__SPACETIMEDB_DB__`.
- `game-scene.ts` — seat names for one table, the known table in the joined lobby, that table's `GameTable` / `GameSeat` subscription queries, and `dummyStateFromJson` for the dummy counter.
- `game-scene-view.ts` — `GameScene`. Green table, seat labels, Leave Table, and the dummy counter. `sendIntent` calls `handleGameIntent`. The count text is the subscribed `stateJson`.
- `lobby.ts` — name and room-code field editing, which `LobbyMember.name` rows belong to the joined lobby, the table-list rows for that lobby, and `GAME_CATALOG`. That catalog offers Bluff from `bluffGameDefinition` (`gameType`, display name, min and max players, how-to-play). Stub and dummy stay on the rules registry and are not Create Table choices.
- `lobby-panel.ts` — canvas name field, optional room code, and the joined room. It tells `LobbyScene` which lobby was joined.
- `lobby-scene.ts` — `LobbyScene` on the boot scene. Lists game name, table name, `currentSeats/maxPlayers`, and status. Create Table picks a game and max players. A table click calls `joinTable` and opens `GameScene`.
- `vite-env.d.ts` — those two compile-time globals.
- `test-setup.ts` — Node stubs so Excalibur can load under Vitest.
- `*.test.ts` — Vitest. Pixel checks read `../public/assets/` with `pngjs`. `table-atlas.test.ts` uses `@vitest-environment happy-dom`.

`sheets.ts` is shared geometry. The atlases map names onto that geometry. `boot-scene.ts` still places a few cells itself for the static demo.

## Changes

Keep `ImageFiltering.Pixel` on every `ImageSource`. Change a cell in `sheets.ts` or the atlas map, then update the test that reads the PNG.

The hearts sheet is not a straight Ace-to-King grid. Row 0 column 0 is blank. Row 2 is 10, Jack, a joker, King, Queen. Read the comment in `card-atlas.ts` before moving a rank.

`CardAtlas` takes the hearts image and the card back. `ChipAtlas` takes the chip sheet. `TableAtlas` constructs its own image sources from `/assets/table-*.png`.

New connection behavior goes through `connect.ts`. Import tables and reducers from `module_bindings`, which re-exports the generated module.

Run `pnpm test` and `pnpm --filter client typecheck` from the repo root.

## Leave alone

Do not edit `module_bindings/` by hand.

Do not turn antialiasing on, and do not scale the canvas by a fraction. `integerScale` in `sheets.ts` is the scale `main.ts` applies.

Do not validate a move here. `sendIntent` forwards the click. The module decides.
