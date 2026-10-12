# Repo conventions

Shared layout and style for this repository. Each `AGENTS.md` says what that folder owns. This file is the style those guides point at.

## Layout

pnpm workspace (`pnpm-workspace.yaml`) with `client`, `server`, and `discord-bot`.

```
client/                    Vite + Excalibur app
  index.html               canvas host
  public/assets/           sheets the client draws
  src/                     TypeScript
    module_bindings/       generated; do not edit
server/                    SpacetimeDB module
  src/index.ts             tables and reducers
  src/rules-by-type.ts     rulesByType registry
discord-bot/               Discord slash commands and voice channels
  src/                     TypeScript service
src/shared/games/          GameRules and GameDefinition
src/shared/discord-player-name.ts
                           Discord user id to the default lobby name
docs/                      architecture, milestones, UI spec
scripts/bootstrap.sh       local tools, publish, generate bindings
card-assest -pack/         Pixel Poker Pack source art
```

The space and the spelling in `card-assest -pack` are the folder name. Leave it.

`src/shared/games/` holds `GameRules<State, Intent>` and `GameDefinition`. It is not a workspace package. `pnpm typecheck` checks it with `src/shared/tsconfig.json`. The module source is `server/src/index.ts`. `server/src/rules-by-type.ts` looks those shared types up by `gameType` and does not declare a second copy.

## Package manager

`packageManager` is `pnpm@10.26.1`. Root scripts:

- `pnpm dev` — Vite client on `0.0.0.0:5173`
- `pnpm build` — client production build
- `pnpm lint` — `eslint .` and `prettier --check .`
- `pnpm test` — client Vitest suite, then the server rules tests, then the discord-bot tests
- `pnpm typecheck` — `tsc --noEmit` in `client`, `server`, `discord-bot`, and `src/shared`

`scripts/bootstrap.sh` installs with `pnpm install --frozen-lockfile` when `pnpm-lock.yaml` is present.

## TypeScript

TypeScript `5.9.3` is pinned in the root, `client`, `server`, and `discord-bot` package files. The workspace packages are `"type": "module"`.

`client/tsconfig.json` and `server/tsconfig.json` share:

- `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `target` ES2022, `module` ESNext, `moduleResolution` bundler
- `isolatedModules`, `noEmit`, `skipLibCheck`
- `include`: `["src"]`

The client also sets `lib` to `ES2022`, `DOM`, and `DOM.Iterable`, plus `useDefineForClassFields` and `moduleDetection: "force"`.

## Formatting and lint

Prettier (`.prettierrc.json`): `singleQuote`, `trailingComma: "all"`. Semicolons and two-space indent stay at Prettier defaults.

ESLint (`eslint.config.js`) is the flat config: `@eslint/js` recommended, `typescript-eslint` recommended, then `eslint-config-prettier`. Unused vars and args may start with `_`.

ESLint ignores `node_modules`, `dist`, `**/module_bindings/**`, `card-assest -pack`, and `client/public`.

Prettier ignores those plus `pnpm-lock.yaml` and `docs`. Docs are hand-formatted.

## Code style in the sources

Hand-written TypeScript uses named exports. `server/src/index.ts` also has `export default spacetimedb`, which the SpacetimeDB CLI expects.

Exported functions declare a return type. Closed sets use `as const` and `satisfies` (`RANKS`, `CHIP_VALUES`, `TABLE_STYLES`). Client unions are string types (`Suit`, `TableStyle`). Server enums are `t.enum` values and are read as `{ tag: 'open' }`.

Loops step with `+= 1`. Unused callback parameters start with `_`. Comments explain sheet layout the pixels do not make obvious, as in `card-atlas.ts` and `chip-atlas.ts`.

The client throws `Error` for a missing sheet or an unknown denomination. Reducers throw `SenderError` for a bad client call.

Do not commit an auth token. `README.md` says a hosted database is selected later with `SPACETIMEDB_HOST` and `SPACETIMEDB_DB`.

## Client canvas

Excalibur `0.32.0`. Logical resolution is `960×540` (`LOGICAL_WIDTH` and `LOGICAL_HEIGHT` in `client/src/sheets.ts`).

`client/src/main.ts` builds the engine with `DisplayMode.Fixed`, `antialiasing: false`, `snapToPixel: true`, `suppressHiDPIScaling: true`, `pixelRatio: 1`, and `suppressPlayButton: true`. Felt color is `#145c38`. Sprites use `{ filtering: ex.ImageFiltering.Pixel }`.

`integerScale` is the largest integer that fits the window, and at least `1`. The canvas style is `image-rendering: pixelated`. `client/index.html` sets the same on `canvas`, and paints the page around it `#07140d`.

`docs/ui-ux.md` draws menus and buttons in the canvas. `index.html` is the host, not a UI kit.

Vite `8` (`client/vite.config.ts`): `host` `0.0.0.0`, port `5173`, `strictPort: true`, `envDir` the repo root. `__SPACETIMEDB_HOST__` and `__SPACETIMEDB_DB__` are compile-time defines. Defaults are `ws://127.0.0.1:3000` and `cardroom`. Declarations live in `client/src/vite-env.d.ts`.

## SpacetimeDB

`spacetimedb` `2.10.2` is the source of truth for lobby membership and table rows. The client renders subscribed `stateJson` and sends intents. It does not decide whether a move is legal. The module today implements `create_lobby`, `join_lobby`, `join_lobby_with_discord`, `set_lobby_discord_channel`, `set_lobby_discord_voice`, `clear_lobby_discord_voice`, `close_lobby`, `update_speaking_state`, `update_voice_presence`, `create_game_table`, `set_table_discord_voice`, `clear_table_discord_voice`, `remove_game_table`, `clean_empty_tables`, `set_empty_table_idle_timeout`, `join_table`, `leave_table`, and `handle_game_intent`. `Lobby.discordChannelId` is empty until `set_lobby_discord_channel` stores the Discord channel id. `discordGuildId`, `discordLobbyVoiceChannelId`, and `GameTable.discordVoiceChannelId` stay empty until the bot stores a voice channel. `join_lobby_with_discord` stores a Discord user id on the same `(lobbyId, clientId)` row. A web `join_lobby` leaves `discordUserId` empty. Changing `name` does not change that id. `discordDiscriminator` is stored only when the join includes one. GameType `dummy` is a shared counter. GameType `bluff` is Bluff: one deck, hands, a discard pile, and a required rank. GameType `president` is President: one deck, hands, a play pile, and a finish order. GameType `go_fish` is Go Fish: one deck, hands, a stock, and books. GameType `crazy_eights` is Crazy Eights: one deck, hands, a stock, a face-up discard, and a suit in play. GameType `rummy` is Rummy: one deck, hands, a stock, a discard pile, and melds. GameType `blackjack` is Blackjack: one deck, a dealer hand, player hands, and bets. GameType `spades` is Spades: four players, partnership bids, and trump tricks. GameType `hearts` is Hearts: one deck, a three-card pass, tricks, and scores for hearts and the queen of spades. GameType `poker` is Poker: Texas Hold'em, Omaha, and Oklahoma share one betting table. `join_table` deals a table whose `stateJson` is still `phase: "lobby"` once the seated count reaches `minPlayers`. A stored `phase` of `play` or `pass` sets the table status to `in_progress`, and `finished` sets it to `finished`. Dummy and stub rows have no phase, so their status stays. `clean_empty_tables` deletes a table with zero seats when `status` is `finished` or `lastActivityAt` is older than the idle timeout. A seated table stays. `set_empty_table_idle_timeout` changes that timeout. The default is 15 minutes.

Schema and reducers are `server/src/index.ts`. `CaseConversionPolicy.None` keeps names as written: PascalCase tables (`Lobby`, `LobbyMember`, `GameTable`, `GameSeat`, `GameEvent`, `VoicePresence`, `SpeakingState`, `TableCleanupSchedule`), camelCase columns, snake_case reducers. Tables are `public: true`.

`scripts/bootstrap.sh` publishes `server/` to the database named by `SPACETIMEDB_DB` (default `cardroom`), then generates TypeScript into `client/src/module_bindings/`. After a schema or reducer change, publish and generate again. Do not hand-edit the generated files. ESLint and Prettier already skip that folder.

The client connects in `client/src/connect.ts` with `DbConnection.builder()`.

## Assets

Sprites are SoapBoy's Pixel Poker Pack, checked in under `card-assest -pack`. The license allows the pack in a private team repository and forbids publishing the raw files where people outside the team can download them. Keep this GitHub repository private.

The client loads copies in `client/public/assets/`, not the pack directory:

- `cards-hearts.png` — light hearts sheet, 320×256, five columns by four rows of 64×64. Column 0 row 0 is blank. The Ace is the next cell. The Jack, a joker, the King, and the Queen share row 2.
- `card-back-01.png` — 192×128, three columns by two rows. The first cell is the back.
- `chips-no-outline.png` — 192×44, six 32×44 chips, left to right: green, red, blue, yellow, black, white.
- `table-green.png`, `table-purple.png`, `table-red.png` — 129×80, no guide overlay.
- `press-start-2p.ttf` and `press-start-2p-LICENSE.txt` — Press Start 2P by Cody Boisclair, SIL Open Font License 1.1. The pack has no pixel font.

Copy a new sheet into `client/public/assets/` when the client needs it. Keep the pack as the source art.

## Tests

Vitest `3` (`client/vitest.config.ts`): environment `node`, include `src/**/*.test.ts`, setup file `src/test-setup.ts`. That setup file stubs `window` because Excalibur's ESM build reads it while the module loads. `table-atlas.test.ts` opts into `@vitest-environment happy-dom`.

Tests sit next to the unit (`sheets.test.ts`, `card-atlas.test.ts`, `chip-atlas.test.ts`, `table-atlas.test.ts`). They read the PNGs in `client/public/assets/` with `pngjs` and compare pixel buffers. `pnpm test` runs that client suite, then the server rules tests. `pnpm --filter server test` registers the shared stub `gameType` on `rulesByType`, checks that an unknown `gameType` does not return those rules, checks the dummy counter, checks Bluff, President, and Go Fish dealing and intents, and checks Crazy Eights dealing, moves, scoring, and end conditions, and checks Rummy dealing, melds, scoring, and end conditions, and checks Blackjack shoe, bets, scoring, and the end of a round, and checks Spades dealing and intents, and checks Hearts dealing, the pass, scoring, and the finish, and checks Poker dealing, betting, side pots, and Hold'em, Omaha, and Oklahoma.

## Docs

`docs/architecture.md` is the target data model and the client/server split. `docs/implementation.md` is the milestone order. `docs/ui-ux.md` is the in-canvas layout. Those files describe scenes and games the code does not have yet. When a doc and the code disagree about what runs today, the code is what runs. Update the doc when you change the plan.
