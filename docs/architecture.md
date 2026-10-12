# architecture.md

## Overview

This project is an online, browser-based **multiplayer card room**:

- A **lobby** (room) can hold up to ~50 anonymous people.
- Inside a lobby, there are many **tables** (GameTables), each running one specific card game (Bluff, Poker, etc.).
- Several tables of the same game type can exist in one lobby, up to `RoomCaps.maxTablesPerLobby`.
- Players can:
  - join/leave the lobby via a link (web or Discord),
  - create new tables of any supported game,
  - join/leave tables at will,
  - move freely between tables while staying in the same lobby.
- There is **no host**. Everyone in the lobby has the same permissions.
- All visuals live inside a **single Excalibur.js canvas**, using the Pixel Tabletop Kit for cards, chips, and table art.
- **SpacetimeDB** is the authoritative state store and rules engine.

New games are added by defining game rules on the server and a game driver on the client; the lobby, networking, and base UI stay the same.

## High-Level Architecture

### Client (Browser)

**Tech:** TypeScript + Excalibur.js.

**Responsibilities:**

- Render:
  - main menu,
  - lobby / room list of tables,
  - individual game tables and their states.
- Manage scenes:
  - `BootScene` – asset loading, initial setup.
  - `LobbyScene` – lobby UI with tables and members.
  - `GameScene` – per-table game view driven by game-specific logic.
- Maintain a WebSocket (or similar) connection to SpacetimeDB.
- Subscribe to:
  - `Lobby`, `LobbyMember`, `GameTable`, `GameSeat`.
- Map user actions to **intents** and send them to SpacetimeDB.
- Handle simple animations (card hover, card movement, chip movement).

**Non-responsibilities:**

- Deciding if a move is legal.
- Enforcing turn order.
- Keeping authoritative game state.

The client is a rich renderer + input adapter; everything else is delegated to the backend rules.

### SpacetimeDB (Backend)

**Responsibilities:**

- Store and synchronize canonical state:
  - Lobbies
  - LobbyMembers
  - GameTables
  - GameSeats
  - Game state (serialized as JSON per table)
- Apply intents from clients using per-game rules modules:
  - Validate the intent (right player, right phase, legal move).
  - Compute the next state from the previous one.
- Coordinate:
  - joining/leaving lobbies,
  - creating/joining/leaving tables,
  - handling reconnection.
- Optionally, log `GameEvent`s for history/analytics.

SpacetimeDB is the **single source of truth** for game state and lobby structure.

### Discord Integration

A small bot / HTTP service:

- Handles slash commands like `/cardroom create` from the `discord-bot/` service.
- On “create”:
  - calls `create_lobby`, the same reducer the web app uses,
  - stores the Discord channel on that lobby with `set_lobby_discord_channel`,
  - returns a link (`https://yourgame.com/ROOMCODE`) into that lobby.
- `/cardroom status ROOMCODE` reads that lobby and replies whether it is live, with the number of tables and players. A missing code says the room was not found.

Discord is just an entry point; it never owns or mutates game state directly.

Voice channels are in [discord-bot-architecture.md](discord-bot-architecture.md). `SpeakingState` rows say who is speaking. Speaking indicators on the canvas are still planned there. A browser that arrives with a Discord user id calls `join_lobby_with_discord`. A web join calls `join_lobby` and leaves the Discord columns empty.

## Data Model

### Lobby

Represents a single card room.

- `id: string` – internal identifier.
- `code: string` – short human code used in URLs (e.g. `AB3D`).
- `status: "open" | "closed"`.
- `createdAt: number` – timestamp.
- `lastActivityAt: number | null` – last join, table change, intent, speaking update, or voice presence. Null on a row from before the column existed; the next idle sweep stamps it and waits out a full timeout.
- `discordChannelId: string` – Discord channel that ran `/cardroom create`, or empty for a web lobby.
- `discordGuildId: string` – guild that owns the lobby voice channel, or empty.
- `discordLobbyVoiceChannelId: string` – lobby voice channel, or empty.

Lobbies share the system until `RoomCaps.maxLobbies`. Each lobby has its own members and tables.

### RoomCaps

One row (`id` `room`) holds the soft caps `maxLobbies`, `maxTablesPerLobby`, and `maxSeatsPerTable`. `init` seeds 64, 16, and 8. `set_room_caps` replaces them. A game's catalog `maxPlayers` stays the seat count when `maxSeatsPerTable` is higher. `create_game_table` rejects a seat count above the catalog or above the seat cap. `join_table` rejects a seat past the tighter of the two.

`close_idle_lobbies` runs every second from the private `LobbyIdleSweep` schedule. It closes an open lobby that has been idle longer than the timeout in `LobbyIdleConfig`, using the same closed status as `close_lobby`. The production timeout is 24 hours. `set_lobby_idle_timeout` with `dev` true stores a 1 to 60 second timeout for a local check. A closed lobby rejects `join_lobby`.

### LobbyMember

Represents a person inside a lobby.

- `id: string`.
- `lobbyId: string`.
- `clientId: string` – anonymous per-browser identity, stable via localStorage.
- `name: string` – editable display name. Changing it does not change `discordUserId`.
- `connected: boolean`.
- `lastSeenAt: number`.
- `discordUserId: string` – Discord snowflake, or empty for a web-only member.
- `discordUsername: string`.
- `discordGlobalName: string`.
- `discordDiscriminator: string | null` – stored only when Discord sends a four-digit discriminator.

There is **no host flag**. Every member is equal.

A single `clientId` can be in multiple lobbies over time, but only one `LobbyMember` per `(lobbyId, clientId)` pair.

### GameTable

Represents one table running one card game.

- `id: string`.
- `lobbyId: string` – which room this table belongs to.
- `gameType: string` – e.g. `"bluff"`, `"poker_holdem"`, `"blackjack"`, `"hearts"`.
- `name: string` – display label, e.g. `"Bluff #1"`, `"Hold’em #3"`.
- `status: "waiting_for_players" | "in_progress" | "finished"`.
- `minPlayers: number`.
- `maxPlayers: number`.
- `stateJson: string` – serialized game state (game-type-specific).
- `createdAt: number`.
- `discordVoiceChannelId: string` – table voice channel, or empty for a web lobby.
- `lastActivityAt: number | null` – last create, join, leave, or applied intent. Empty until one of those writes it, and then idle time falls back to `createdAt`.

Several `GameTable` rows of the same `gameType` can share a lobby, up to `RoomCaps.maxTablesPerLobby`. `maxPlayers` stays the catalog seat count when the seat cap is higher.

### GameSeat

Represents a player currently seated at a specific table.

- `id: string`.
- `tableId: string`.
- `lobbyMemberId: string`.
- `seatIndex: number` – seating order for layout and turn order.
- `chips: number | null` – chip stack for games with betting, null for others.
- `joinedAt: number`.
- `seatState: "active" | "folded" | "disconnected"` (optional).

A `LobbyMember`:

- can be in **zero or one** `GameSeat` at a time (to start simple),
- always remains a `LobbyMember` in the lobby even after leaving a table.

### GameEvent

An applied intent appends one row. A rejected intent does not.

- `id: string` — `event_<tableId>_<order>`, with `order` zero-padded so ids sort in apply order.
- `tableId: string`.
- `lobbyMemberId: string`.
- `type: string` – the intent type, such as `"play_card"`, `"bet"`, or `"fold"`.
- `payloadJson: string` – `{ order, intent }`, enough for a replay to sort and reapply that action.
- `createdAt: number`.

A later replay reads `GameEvent` for that table in `order`.

### SpeakingState

One row is one `LobbyMember` in one voice channel. The bot calls `update_speaking_state` with a Discord user id, a channel id, and `isSpeaking`. A user who has not joined that lobby is ignored. The row carries no audio.

- `lobbyId: string`.
- `tableId: string` – empty for lobby voice.
- `lobbyMemberId: string`.
- `isSpeaking: boolean`.
- `lastUpdatedAt: number`.

## Game Rules Abstraction (Server)

The logic for each game type lives in a `GameRules` implementation.

```ts
interface GameRules<State, Intent> {
  initialState(players: GameSeat[], table: GameTable): State;
  applyIntent(
    prev: State,
    intent: Intent,
    ctx: { seat: GameSeat; now: number }
  ): State;
  onPlayerJoin?(prev: State, seat: GameSeat): State;
  onPlayerLeave?(prev: State, seat: GameSeat): State;
  // Optional helpers if needed
  isJoinAllowedDuringPhase?(state: State): boolean;
  isTableReadyToStart?(state: State): boolean;
}
```

- `State` is a plain serializable object defining game-specific state:
  - deck, hands, discard pile, current player index, phase, scores, etc.
- `Intent` is a typed description of an action from the client:
  - e.g. `{ type: "play_card", cardId: string }`
  - or `{ type: "bet", amount: number }`.

Server registry:

```ts
const rulesByType: Record<string, GameRules<any, any>> = {
  bluff: bluffRules,
  president: presidentRules,
  crazy_eights: crazyEightsRules,
  poker_holdem: holdemRules,
  poker_five_card_draw: fiveCardDrawRules,
  blackjack: blackjackRules,
  hearts: heartsRules,
  spades: spadesRules,
  rummy: rummyRules,
  go_fish: goFishRules,
};
```

## Intent Handling Flow (Server)

For each incoming client action:

1. Client sends an intent to SpacetimeDB: `handleGameIntent(tableId, clientId, intentPayload)`.
2. Backend:
   - Resolves `LobbyMember` and `GameSeat` from `clientId`.
   - Looks up `GameTable` for `tableId`.
   - Finds `rules = rulesByType[table.gameType]`.
   - Deserializes `table.stateJson` → `prevState`.
   - Calls `rules.applyIntent(prevState, intent, { seat, now })`.
   - Serializes new state and updates `table.stateJson`.
   - Appends one `GameEvent` for that table with the apply order and the intent payload.
3. SpacetimeDB broadcasts updated `GameTable` (+ `GameSeat` changes if needed) and the new `GameEvent` to subscribers. A rejected intent adds no `GameEvent`.

Game rules are pure functions from state + intent → new state.

## Client Game Driver Abstraction

On the client side, each game type has a driver responsible for:

- interpreting the `State` into actors and visual positions,
- mapping user input events into intents to send.

```ts
interface RenderContext {
  engine: ex.Engine;
  table: GameTable;
  seats: GameSeat[];
  meSeat: GameSeat | null;
  assets: {
    cards: CardAtlas;
    chips: ChipAtlas;
    fonts: FontAtlas;
  };
  sendIntent: (intent: any) => void;
}

interface GameDriver<State> {
  name: string;
  gameType: string;
  render(state: State, ctx: RenderContext): void;
  handleInput(event: InputEvent, state: State, ctx: RenderContext): void;
  destroy(ctx: RenderContext): void;
}
```

The `GameScene`:

- Subscribes to the table’s `GameTable` and `GameSeat`s.
- Deserializes `stateJson` on updates.
- Passes state + context to `driver.render`.
- Routes pointer/keyboard events to `driver.handleInput`.
- Uses `ctx.sendIntent` to send structured intents back to the server.

Drivers contain no networking logic, only:

- layout logic,
- selection and clicking behavior,
- calls to `sendIntent`.

## Scenes and Client Flow

### BootScene

Responsibilities:

- Initialize Excalibur engine and fixed virtual resolution.
- Load:
  - Pixel Tabletop Kit card sheets and chip sprites.
  - Table backgrounds.
  - Pixel fonts.
- Create helpers:
  - `CardAtlas` – know how to draw each rank/suit.
  - `ChipAtlas` – know how to draw each denomination/stack.
  - `FontAtlas` – text drawing helpers.

On completion: transition to `MainMenuScene` (or directly to `LobbyScene` if auto-joining).

### LobbyScene

Responsibilities:

- Connect to SpacetimeDB for a given `lobbyCode` and `clientId`.
- Subscribe to:
  - `Lobby` (the room metadata),
  - `LobbyMember` list,
  - `GameTable` list for that lobby,
  - `GameSeat` list for those tables.
- Render:
  - list of tables (grouped by game type),
  - list of players in the lobby,
  - “Create Table” UI.

Interactions:

- Create table:
  - Choose `gameType`, `maxPlayers`, optional settings.
  - Call `createGameTable`.
- Join table:
  - Click table → call `joinTable`.
  - On success → transition to `GameScene` bound to that `tableId`.
- Leave table:
  - From GameScene, “Leave Table” returns the user to LobbyScene.
- Leave lobby:
  - Back to main menu.

LobbyScene never needs to know the internal rules of any game; it only cares about `GameTable` metadata and seat counts.

### GameScene

Responsibilities:

- Manage a single table’s view, identified by `tableId`.
- Subscribe to:
  - that table’s `GameTable`,
  - that table’s `GameSeat`s.
- Determine `gameType` and select the corresponding `GameDriver`.
- Provide drivers with:
  - deserialized `stateJson`,
  - `RenderContext`.

Interactions:

- User actions (card selection, button clicks) → `GameDriver.handleInput` → `sendIntent`.
- User can open/close a per-game “How to Play” overlay.
- User can leave the table; client calls `leaveTable` and transitions back to LobbyScene.

The actual visual structure (card positions, chip stacks, dealer seat) is implemented inside each game driver but uses shared base components.

## Identity and Reconnection

To keep things simple and anonymous but still reconnectable:

- On first visit:
  - generate a `clientId` (UUID) and store it in `localStorage`.
- On lobby join:
  - client sends `clientId` + user-chosen `name`.
  - a join URL with a Discord user id (`discordUserId` or `discord_user_id`) plus a username also sends `discordUsername`, `discordGlobalName`, and `discordDiscriminator` when Discord included one. That calls `join_lobby_with_discord`. The display name is the mapped default (global name, otherwise username) and the join submits without typing.
  - a URL without a Discord user id calls `join_lobby`. Discord fields stay empty.
  - backend:
    - if a `LobbyMember` with that `(lobbyId, clientId)` exists, reuse it and update name.
    - a later name change keeps the stored `discordUserId`.
    - otherwise, create a new `LobbyMember`.
- On reconnect:
  - same `clientId` is reused.
  - backend marks member as reconnected.
  - if they still have a `GameSeat` in some table:
    - client can automatically offer to re-open that table.

No passwords, email, or long-term accounts; just soft identity.

## Initial Game Catalog

All games use the same card sprites and table assets.

Planned initial set:

1. Bluff / Cheat / “I Doubt It”.
2. President.
3. Crazy Eights.
4. Texas Hold’em Poker.
5. Five-Card Draw Poker.
6. Blackjack (multi-player vs dealer).
7. Hearts.
8. Spades.
9. Rummy (e.g., 500 Rummy).
10. Go Fish.

Each game has:

- A `GameRules` module (server).
- A `GameDriver` (client).
- A `GameDefinition` entry containing:
  - `gameType`,
  - display name,
  - min/max players,
  - “How to Play” text.

## Extensibility

The architecture is intentionally generic:

- Adding a new game:
  - define its rules and state structure,
  - wire a new driver to render it.
- Adding new assets:
  - update `CardAtlas` / `ChipAtlas` / `TableAtlas`.
- Supporting variants (e.g., different betting structures, house rules):
  - add settings fields on `GameTable` and handle them in rules + driver.

The lobby and table infrastructure remain unchanged, so AI/agents only need to operate inside well-defined boundaries when generating new games.
