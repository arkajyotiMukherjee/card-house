# [implementation.md](http://implementation.md)

## Overview

This document breaks the build into clear milestones so you can move from a blank repo to a working multi-table card room without the project exploding in complexity. The order is important: first get the foundations (assets, networking, state model), then one complete game, then everything else.

## Milestone 1 – Project Skeleton & Tooling

**Goal:** A clean TypeScript + Excalibur.js project with basic tooling.

- Initialize repo:
  - Use Vite (or similar) with TypeScript.
  - Add Excalibur.js and confirm a simple “Hello World” scene runs.
- Tooling:
  - TypeScript in strict mode.
  - ESLint + Prettier.
  - Simple `npm run` or `pnpm` scripts:
    - `dev`, `build`, `lint`, `test`, `typecheck`.

**Deliverable:** Opening the dev server shows a blank Excalibur canvas with a placeholder sprite or background.

## Milestone 2 – Asset Loading & Core Visual Helpers

**Goal:** Load the Pixel Tabletop Kit and be able to draw cards, chips, and tables.

- Add Pixel Tabletop Kit assets under `public/assets/` or similar.
- Implement `BootScene`:
  - Load:
    - card sheet(s) for fronts and backs,
    - chip sprites,
    - table background(s),
    - pixel font(s).
- Implement atlases:
  - `CardAtlas`:
    - maps `{ rank, suit }` → `ex.Sprite`.
  - `ChipAtlas`:
    - maps chip denomination → `ex.Sprite` (and optionally to “stack” sprites).
  - (Optional) `TableAtlas`:
    - maps table style name → table background sprite.
- Draw a static demo:
  - Green felt background,
  - one or two cards in known positions,
  - a small chip stack.

**Deliverable:** A static, nicely rendered pixel table on screen using real assets.

## Milestone 3 – SpacetimeDB Schema & Basic Lobby Membership

**Goal:** Define the core data model on the backend and hook up basic lobby join functionality.

- In SpacetimeDB, define tables:
  - `Lobby`
  - `LobbyMember`
  - `GameTable`
  - `GameSeat`
  - (optional) `GameEvent`
- Implement resolvers:
  - `createLobby()`:
    - generates `code`,
    - creates `Lobby`.
  - `joinLobby(lobbyCode, clientId, name)`:
    - finds or creates `LobbyMember` for `(lobbyId, clientId)`.
- Client:
  - Generate or read `clientId` from `localStorage`.
  - Simple name entry + optional room code field.
  - On join success, open a very simple “lobby view” with just:
    - the room code,
    - list of `LobbyMember.name`.

**Deliverable:** Multiple browser tabs can join the same lobby and see a live-updating list of members (no tables yet).

## Milestone 4 – Tables & Seats (Card Room Without Games)

**Goal:** Add multi-table support and seating, but no game rules yet.

- Backend:
  - `createGameTable(lobbyId, gameType, settings?)`:
    - inserts `GameTable` with `status = "waiting_for_players"`.
  - `joinTable(tableId, lobbyMemberId)`:
    - enforces `maxPlayers`,
    - creates `GameSeat` (assigns `seatIndex`).
  - `leaveTable(tableId, lobbyMemberId)`:
    - removes or marks `GameSeat` as gone.
- Client – LobbyScene:
  - Subscribe to `GameTable` and `GameSeat` for the current lobby.
  - Render a vertical list of tables:
    - game name, table name, `currentSeats/maxPlayers`, status.
  - Add “Create Table” button:
    - pop-up to choose game type and max players.
  - Clicking a table:
    - calls `joinTable`,
    - on success, switches to a placeholder GameScene.
- Client – GameScene:
  - Subscribe to that table’s `GameTable` and `GameSeat`s.
  - Draw:
    - a generic table background,
    - seat labels (names of players),
    - “Leave Table” button that returns to lobby view.

**Deliverable:** You can create, join, and leave many tables in a single lobby, seeing seat counts update live.

## Milestone 5 – Game Rules Infrastructure

**Goal:** Add the generic “rules engine” layer to SpacetimeDB.

- Shared (`src/shared/games/`):
  - Define `GameRules<State, Intent>` interface.
  - Define `GameDefinition`:
    - `gameType`
    - display name
    - min/max players
    - how-to-play markdown text.
- Backend:
  - Implement `rulesByType` registry (empty or stubbed initially).
  - Implement `handleGameIntent(tableId, clientId, intentPayload)` resolver:
    - resolve `LobbyMember` and `GameSeat` from `clientId`.
    - fetch `GameTable` and `rulesByType[gameType]`.
    - deserialize `stateJson` → `State`.
    - call `rules.applyIntent`.
    - serialize new state back into `stateJson`.
  - Wire SpacetimeDB to broadcast updated `GameTable` to clients.
- Client:
  - In GameScene, add `sendIntent` helper that calls `handleGameIntent`.
  - Subscribe to `stateJson` changes (in the `GameTable` row) and deserialize to `State`.

**Deliverable:** A test “dummy” game that just increments a counter on each click, fully wired through backend rules and intents.

The wired game is `gameType` `dummy`. `GameTable.stateJson` is `{ "count": number }`, starting at `0`. A click sends `{ "type": "increment" }` through `handle_game_intent`. GameScene paints `count` from that subscribed row.

## Milestone 6 – First Real Game End-to-End

**Goal:** Implement one actual card game from rules to visuals (start with something manageable like Five-Card Draw Poker or Bluff).

Pick a first game:

- Option A: **Five-Card Draw Poker**
  - Good to test chips, dealing, and betting.
- Option B: **Bluff / Cheat**
  - Very party-friendly, simpler state (hands, pile, current claim, challenge).

Backend:

- In `src/shared/games/<game>.ts`:
  - Define:
    - card representation,
    - `State` structure,
    - `Intent` variants.
  - Implement `GameRules`:
    - `initialState`:
      - shuffle deck,
      - deal hands,
      - set initial turn and phase.
    - `applyIntent`:
      - enforce turn order,
      - apply moves,
      - detect round or game end.
    - `onPlayerJoin` / `onPlayerLeave`:
      - decide how to handle mid-game joins/leaves.
- Add tests:
  - pure unit tests for `applyIntent` and `initialState`.

Client:

- Implement `GameDriver<State>`:
  - Render:
    - your hand at bottom (using `CardAtlas`),
    - other players’ seats around table,
    - central area (pile, community cards, or pot).
  - Handle input:
    - card selection,
    - action buttons (e.g. “Play”, “Bet”, “Call”, “Fold”).
  - Basic animations:
    - hover lift for clickable cards,
    - tween cards between positions for dealing/playing.

Integrate:

- Add game definition to a `GameCatalog` used by LobbyScene and table creation.
- Ensure you can:
  - create a table of that type,
  - join with multiple clients,
  - play to completion.

**Deliverable:** One full game, playable across clients, exercising the full stack.

## Milestone 7 – UI & UX Polish (Menus, How-To-Play, Nice Lobby)

**Goal:** Make the experience feel like a finished product rather than a tech demo.

Client:

- **Main Menu Scene:**
  - Title logo and animated cards/chips in background.
  - Buttons:
    - “Create Room”
    - “Join Room”
    - “How to Play (All Games)”
- **LobbyScene polish:**
  - Group tables by game type visually.
  - Show which table you’re currently seated at.
  - Show lobby code prominently.
  - Add a subtle idle card animation in the background.
- **GameScene polish:**
  - Per-game “How to Play” overlay:
    - text sourced from `GameDefinition`.
    - open/close via “?” icon.
  - Status HUD:
    - whose turn,
    - phase label,
    - small round/hand counter.
  - Better feedback:
    - flash/highlight on illegal moves,
    - simple message strip for events (“Alice called your bluff!”).

**Deliverable:** Cohesive card-room UX with nice transitions and readable game instructions.

## Milestone 8 – Add More Games

**Goal:** Use the existing pattern to add the rest of the launch games.

For each game (e.g., Crazy Eights, Blackjack, Hearts, Spades, Rummy, Go Fish, President):

- Backend:
  - Create `GameRules` implementation.
  - Write unit tests covering:
    - dealing/shuffling,
    - legal/illegal moves,
    - scoring and end conditions.
- Client:
  - Add `GameDriver<State>`:
    - reuse the same base layout as much as possible.
    - adjust central area / special zones (tricks, piles, books) as needed.
- Shared:
  - Register new game in `GameCatalog` with:
    - `gameType`,
    - display name,
    - min/max players,
    - how-to-play text.

**Deliverable:** A suite of 5–10 playable card games under the same lobby/table system.

## Milestone 9 – Discord Integration

**Goal:** Let users spin up lobbies directly from Discord.

Backend service (can be a small Node/Express or serverless function):

`discord-bot/` registers `/cardroom create` and `/cardroom status`. Create calls `create_lobby`, then `set_lobby_discord_channel` so `Lobby.discordChannelId` is the Discord channel, then creates the lobby voice channel and, when a table appears in that lobby, the table voice channel. Status reads that lobby and replies whether it is live, with the table count and the player count. A missing code replies that the room was not found. The lobby scene shows a Launched from Discord badge when that column is not empty. A join URL with a Discord user id stores that id and uses the mapped default name (global name, otherwise username) without typing.

- Register slash commands:
  - `/cardroom create`
  - `/cardroom status ROOMCODE`
- For `/cardroom create`:
  - Call the same `createLobby()` used by web.
  - Respond with:
    - lobby code,
    - join URL.
- Default player name:
  - Map a Discord user id to the lobby `name` when they join via the link.
  - Use the global name when Discord set one, otherwise the username.

Front-end:

- Optionally show a small “Launched from Discord” badge if the lobby has a linked Discord channel.

**Deliverable:** A working Discord slash command that returns a joinable room link.

Voice channels and speaking indicators are now part of this milestone. The plan is in [discord-bot-architecture.md](discord-bot-architecture.md).

## Milestone 10 – Stability, Scaling & Cleanup

**Goal:** Make the system durable and manageable with real users.

- **Cleanup / lifecycle:**
  - auto-close lobbies after long inactivity (`close_idle_lobbies`, 24 hours, or a 1–60 second dev timeout),
  - auto-clean tables that:
    - have zero seats,
    - and `status = "finished"` or idle for too long.
    - `clean_empty_tables` does this. The default idle time is 15 minutes (`lastActivityAt`, or `createdAt` when that is empty). A seated table stays. `set_empty_table_idle_timeout` can shorten the wait.
- **Limits:**
  - `RoomCaps` stores soft caps. The seeded row is 64 lobbies, 16 tables per lobby, and 8 seats per table. `set_room_caps` replaces those three numbers.
  - `create_lobby` rejects another lobby at `maxLobbies`. `create_game_table` rejects another table in that lobby at `maxTablesPerLobby`.
  - Seat counts stay on the game catalog. A higher `maxSeatsPerTable` does not raise a catalog max. `create_game_table` rejects `maxPlayers` above the catalog max or above the seat cap. `join_table` rejects a seat past the tighter of the two.
- **Monitoring & logs:**
  - log:
    - lobby and table creation,
    - game errors in rules,
    - unusual disconnect/reconnect rates.
- **UX improvements:**
  - smooth reconnection flow:
    - on reload, auto-rejoin last lobby and table if possible.
  - clear feedback when:
    - a table is full,
    - a game is no longer joinable,
    - the lobby has been closed.

**Deliverable:** A version that can be left running for long periods, handling many lobbies and tables without manual babysitting.

## Optional Future Milestones

These aren’t needed for v1, but the architecture supports them cleanly:

- **Spectator mode** (non-seated viewers per table). `spectate_table` stores a `Spectator` row, separate from `GameSeat`. The viewer does not count toward `maxPlayers` and is not dealt a hand. A full table can still be watched.
- **Chat**:
  - lobby-wide (done: `send_lobby_chat_message` stores a `LobbyChatMessage` row every member of that lobby subscribes to),
  - per-table (done: `send_table_chat` stores a `TableChatMessage` row for a sender who is seated or watching that table; a lobby member elsewhere does not see it).
- **Persistent soft profiles**:
  - saved preferred name,
  - color theme,
  - card customizations (assest pack already has variations)
  - simple stats (hands played, games won).
- **Tournaments**:
  - structures composed of multiple tables and rounds.

You can schedule these after the core loop (lobby → tables → play → back to lobby) is rock solid.