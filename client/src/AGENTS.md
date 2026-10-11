# Client source

TypeScript for the Excalibur client. One folder holds the engine, the boot scene, sprite atlases, and the database connection. Tests sit next to the unit they check.

Style, resolution, and pixel filtering: [../../repo-conventions.md](../../repo-conventions.md). Generated bindings: [module_bindings/AGENTS.md](module_bindings/AGENTS.md).

## Files

- `main.ts` — reads or creates `clientId`, then the engine at 960×540, fixed display, integer scale, loader, and `connectCardroom`. The app starts on `MenuScene`. After the lobby subscription applies, it mounts the lobby panel, `LobbyScene`, and `GameScene` with that `clientId`, and hands the panel to the menu. Entering a room from the menu opens the lobby scene (`boot`). Joining a table opens `GameScene`. Leave returns to the lobby.
- `client-id.ts` — `getOrCreateClientId` reads `clientId` from `localStorage` or stores a new UUID. The key name is `clientId`.
- `boot-scene.ts` — boot scene. Draws the green table, two hearts, the card back, one chip, and a status line along the bottom edge.
- `menu-layout.ts` — menu geometry and pure logic: the three button boxes, prompt boxes, how-to-play layout, markdown heading split and word wrap, and the looping pose of each background card or chip.
- `menu-scene.ts` — `MenuScene`, the first scene. Title logo, drifting cards and chips, and Create Room, Join Room, and How to Play (All Games). Create and Join open a canvas prompt (name, plus room code for Join). Submit calls the lobby panel, shows its error in the prompt, and on success opens the lobby scene. How to Play lists `GAME_CATALOG` and shows the selected game's `howToPlay` text. Escape closes a prompt or the overlay.
- `sheets.ts` — pixel sizes and grid math (`CARD_SIZE` 64, chip 32×44, table 129×80, logical 960×540).
- `card-atlas.ts` — `{ rank, suit }` to a sprite. Hearts, diamonds, clubs, and spades share one grid. A suit with no sheet throws.
- `game-driver.ts` — `GameDriver<State>`, the render context, and pointer input.
- `bluff-layout.ts` — hand, pile, and opponent-back positions, plus which card can lift. `finishedLine` names the subscribed winner seat.
- `bluff-driver.ts` — Bluff `GameDriver`. Your hand is face up along the bottom, other hands are card backs, and the discard pile is in the center. Play and Challenge call `sendIntent`. A legal card lifts on hover. A dealt or played card tweens. Phase `finished` draws `finishedLine` and sends no further move. A Play with no card selected is still sent so the module rejects it. When the module rejects an intent, `intentRejected` blinks a red box over the Play or Challenge button and the lifted cards.
- `blackjack-layout.ts` — dealer hand, player hands, and bet-chip positions on the shared table. `finishedLine` names the subscribed winning seats, a push when a hand ties, or the dealer when every hand lost.
- `blackjack-driver.ts` — Blackjack `GameDriver`. The dealer hand is at the top (hole card face down until the round ends), your hand is face up along the bottom, other hands are face up, and each stake is a chip. Bet, Hit, Stand, Double, and Split call `sendIntent`. Phase `finished` draws `finishedLine` and sends no further move. A rejected intent blinks the button that sent it.
- `event-messages.ts` — `readStoredEvent` reads `{ order, note }` from a `GameEvent.payloadJson`, and `eventMessage` turns a Bluff or Blackjack note into one short line. Dummy and stub events have no note and stay silent.
- `chip-atlas.ts` — color or table value to a face sprite and a stack sprite on `chips-no-outline.png`.
- `table-atlas.ts` — `green`, `purple`, or `red` to a table sprite. Green is the default.
- `connect.ts` — `DbConnection.builder()`, the status string, and the `Lobby`, `LobbyMember`, and `GameTable` subscription. `subscribeLobbyTables` adds `GameTable` and `GameSeat` for one lobby. Host and database come from `__SPACETIMEDB_HOST__` and `__SPACETIMEDB_DB__`.
- `game-scene.ts` — seat names for one table, the known table in the joined lobby, that table's `GameTable` / `GameSeat` subscription queries, and `dummyStateFromJson` for the dummy counter.
- `canvas-ui.ts` — shared canvas palette, `canvasText` (Press Start 2P, family `"Press Start 2P"`), and `panelRect`.
- `how-to-play.ts` — `definitionFor(gameType)` over `bluffGameDefinition`, `blackjackGameDefinition`, and `dummyGameDefinition`, plus `layoutHowToPlay`, which turns a definition's `howToPlay` markdown into a title and wrapped lines.
- `how-to-play-overlay.ts` — `HowToPlayOverlay`. The `?` control at top right opens a dimmed window with that table's instructions. `?`, Close, or Escape closes it. The mouse wheel scrolls long text. While open, Leave Table and intents are blocked.
- `game-scene-view.ts` — `GameScene`. Green table, seat labels, Leave Table, the `?` overlay, and the dummy counter. Bluff tables use `BluffDriver` and Blackjack tables use `BlackjackDriver` on the subscribed `stateJson`. Both show the status HUD left of the `?` control. Dummy tables hide the HUD. `sendIntent` calls `handleGameIntent`. The count text is the subscribed dummy `stateJson`. It also subscribes to this table's `GameEvent` rows and shows each new event line, and each rejection reason in red, in a strip under the title that fades after about three seconds. Events that were already stored when the table opened are not replayed.
- `status-hud.ts` — `STATUS_HUD` box, `bluffStatusHud`, and `blackjackStatusHud`. The three HUD lines come from the subscribed `stateJson`: `turnSeatIndex` as a seated name, `phase`, and a round. For Bluff the round is the place of `requiredRank` in Ace to King. For Blackjack it is Bets, Hand, or Done.
- `lobby.ts` — name and room-code field editing, which `LobbyMember.name` rows belong to the joined lobby, the table-list rows for that lobby (`tableLines`, which marks tables the member sits at), `tableGroups` and `listLayout` (one header per game type, catalog games first, rows past the panel counted as hidden), and `GAME_CATALOG`. That catalog offers Bluff from `bluffGameDefinition` and Blackjack from `blackjackGameDefinition` (`gameType`, display name, min and max players, how-to-play). Stub and dummy stay on the rules registry and are not Create Table choices.
- `lobby-panel.ts` — canvas name field, optional room code, and the joined room. It tells `LobbyScene` which lobby was joined. `mountLobbyPanel` returns `enter(kind, name, code)` so the menu can create or join and read the error. Its keyboard handler only runs while the lobby scene is active.
- `lobby-ambience.ts` — idle card positions behind the lobby and `idleCardPose`, a slow whole-pixel bob and small sway.
- `lobby-scene.ts` — `LobbyScene` on the boot scene. A top-center banner shows the room code. The list groups tables by game type, with table name, `currentSeats/maxPlayers`, and status per row. A `YOU` badge marks the table this member sits at. Faint idle cards bob behind the felt. Create Table picks a game and max players. A table click calls `joinTable` and opens `GameScene`.
- `vite-env.d.ts` — those two compile-time globals.
- `test-setup.ts` — Node stubs so Excalibur can load under Vitest.
- `*.test.ts` — Vitest. Pixel checks read `../public/assets/` with `pngjs`. `table-atlas.test.ts` uses `@vitest-environment happy-dom`.

`sheets.ts` is shared geometry. The atlases map names onto that geometry. `boot-scene.ts` still places a few cells itself for the static demo.

## Changes

Keep `ImageFiltering.Pixel` on every `ImageSource`. Change a cell in `sheets.ts` or the atlas map, then update the test that reads the PNG.

The suit sheets are not a straight Ace-to-King grid. Row 0 column 0 is blank. Row 2 is 10, Jack, a joker, King, Queen. Diamonds, clubs, and spades use that same grid. Read the comment in `card-atlas.ts` before moving a rank.

`CardAtlas` takes the hearts image, the card back, and optional sheets for the other suits. `ChipAtlas` takes the chip sheet. `TableAtlas` constructs its own image sources from `/assets/table-*.png`.

New connection behavior goes through `connect.ts`. Import tables and reducers from `module_bindings`, which re-exports the generated module.

Run `pnpm test` and `pnpm --filter client typecheck` from the repo root.

## Leave alone

Do not edit `module_bindings/` by hand.

Do not turn antialiasing on, and do not scale the canvas by a fraction. `integerScale` in `sheets.ts` is the scale `main.ts` applies.

Do not validate a move here. `sendIntent` forwards the click. The module decides.
