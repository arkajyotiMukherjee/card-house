# discord-bot-architecture.md

## Overview

Milestone 9 has two slices. The slash-command slice is already described in [implementation.md](implementation.md). This file is the voice slice, plus the identity fields that slice needs.

The SpacetimeDB module stays TypeScript. The Discord bot is a separate TypeScript service.

The module remains the source of truth for `Lobby`, `LobbyMember`, `GameTable`, `GameSeat`, and `GameEvent`. Existing reducers stay `create_lobby`, `join_lobby`, `create_game_table`, `join_table`, `leave_table`, and `handle_game_intent`. `set_lobby_discord_channel` records the Discord channel for `/cardroom create`. The bot calls reducers. It does not own game state and it does not run game rules.

The client shows who is speaking from SpacetimeDB only. It never receives, stores, or processes audio. No transcripts, no volume meters, no waveforms. The client does not call the Discord API.

## Issues

Slash-command slice, already in milestone 9:

- [#41 Add Discord /cardroom create](https://github.com/arkajyotiMukherjee/discordcardgames/issues/41)
- [#42 Add Discord /cardroom status](https://github.com/arkajyotiMukherjee/discordcardgames/issues/42)
- [#43 Map Discord user id to a default player name](https://github.com/arkajyotiMukherjee/discordcardgames/issues/43)
- [#44 Show a Launched from Discord badge](https://github.com/arkajyotiMukherjee/discordcardgames/issues/44)

Voice slice:

- [#100 Create Discord voice channels for lobbies and tables](https://github.com/arkajyotiMukherjee/discordcardgames/issues/100), blocked by [#41](https://github.com/arkajyotiMukherjee/discordcardgames/issues/41)
- [#101 Store Discord identity next to web-only members](https://github.com/arkajyotiMukherjee/discordcardgames/issues/101), blocked by [#41](https://github.com/arkajyotiMukherjee/discordcardgames/issues/41). [#43](https://github.com/arkajyotiMukherjee/discordcardgames/issues/43) still owns the default display name.
- [#102 Sync who is speaking without handling audio](https://github.com/arkajyotiMukherjee/discordcardgames/issues/102), blocked by [#100](https://github.com/arkajyotiMukherjee/discordcardgames/issues/100) and [#101](https://github.com/arkajyotiMukherjee/discordcardgames/issues/101)
- [#103 Show who is in the Discord voice channel](https://github.com/arkajyotiMukherjee/discordcardgames/issues/103), optional, blocked by [#100](https://github.com/arkajyotiMukherjee/discordcardgames/issues/100) and [#101](https://github.com/arkajyotiMukherjee/discordcardgames/issues/101)
- [#104 Show speaking indicators in the lobby and at the table](https://github.com/arkajyotiMukherjee/discordcardgames/issues/104), blocked by [#102](https://github.com/arkajyotiMukherjee/discordcardgames/issues/102)

## Slash command

`discord-bot/` is the slash-command service. It registers `/cardroom create` and `/cardroom status`, and leaves room for later commands on the same process.

`/cardroom create` calls `create_lobby` with no arguments. That is the client's `createLobby({})`, and it is the call that mints the lobby code. The bot then calls `set_lobby_discord_channel` with that code and the Discord channel id from the interaction. `Lobby.discordChannelId` stores the channel. A lobby created from the web leaves the column empty. The reply is the code and a join URL `{CARDROOM_PUBLIC_URL}/{code}`. Opening that path in the client opens Join Room with the code filled in.

`/cardroom status` takes a room code. It reads the subscribed `Lobby` row for that code. A matching open lobby is live. The reply names that code and the number of `GameTable` rows and `LobbyMember` rows in the lobby. A code with no row replies that the room was not found. Status does not call a reducer.

`discordChannelId` is the channel where the command ran. It is not the lobby voice channel. The bot stores voice channel ids with `set_lobby_discord_voice` and `set_table_discord_voice`. Speaking state stays on its own issue. Discord identity is stored on `LobbyMember` by `join_lobby_with_discord`.

## Two TypeScript services

**Module.** `server/src/index.ts` stays the SpacetimeDB module. New columns and the `SpeakingState` table land there, with reducer names in snake_case, matching `create_lobby` and `join_lobby`.

**Bot.** A separate TypeScript service registers the slash commands from the milestone 9 text, creates and deletes Discord voice channels, and listens for Discord voice state on those channels. It sends speaking updates as user id, channel, and a boolean. It does not read, store, log, or forward audio.

If the bot is down, play continues. Lobbies and tables still work through the existing reducers. Speaking indicators go idle.

## Identity

Three flows share one `Lobby` and the same `GameTable` rows.

**Discord joiners.** The primary id is the Discord user id. The display name is editable. The browser still keeps a `clientId` so the member fits the existing `(lobbyId, clientId)` row. `join_lobby_with_discord` attaches `discordUserId`, `discordUsername`, and `discordGlobalName` to that `LobbyMember`. The join URL can carry that identity as `discordUserId` or `discord_user_id`, plus the username and global name in either style, and `discordDiscriminator` only when Discord sends one. Changing `name` later does not change `discordUserId`.

The default `name` is the Discord global name when it still has letters or digits, otherwise the username. It is cut to the lobby name length (12) and keeps letters, digits, and spaces. The `/cardroom create` reply stays `{CARDROOM_PUBLIC_URL}/{code}`. Opening that path with a Discord user id and a username stores that id and joins with the mapped name, without asking the player to type one. A user id alone is resolved by the bot with Discord `GET /users/{id}` at `GET /default-player-name`. A 401 returns no name and does not invent a user.

**Web-only joiners.** The browser generates a random `clientId` and calls `join_lobby`. Discord fields stay empty. There is no Discord user id. A URL with no `discordUserId` and no `discord_user_id` is this path.

**Both together.** A Discord joiner and a web-only joiner can be in the same lobby and can sit at the same table. There is still no host. `handle_game_intent` does not care which path created the member.

`LobbyMember` gains:

- `discordUserId`
- `discordUsername`
- `discordGlobalName`

`name` stays the editable display name. `discordDiscriminator` is optional and only stored if Discord still sends it.

## Voice channels

The bot creates and deletes the channels. [#100](https://github.com/arkajyotiMukherjee/discordcardgames/issues/100). `close_lobby` and `remove_game_table` are the module transitions it watches. A finished table uses the existing `status`.

- One lobby voice channel, created with `/cardroom create`. Example name: `#room-ab3d-voice`.
- One voice channel per table, created when a table is created in a Discord-linked lobby. Example name: `#ab3d-bluff-1`.
- When a table is finished or removed, the bot deletes that table channel and clears the id.
- When a lobby is closed, the bot deletes the lobby voice channel and any remaining table voice channels.

`Lobby` gains:

- `discordGuildId`
- `discordLobbyVoiceChannelId`

`GameTable` gains:

- `discordVoiceChannelId`

The bot writes those ids through reducers. A web lobby has them empty and gets no Discord channels. The bot respects Discord rate limits. If it is down or rate-limited, lobby and table play continue without voice channels.

## Speaking state

`SpeakingState` is a public table. One row is one `LobbyMember` in one voice channel.

- `lobbyId`
- `tableId` — empty for lobby voice
- `lobbyMemberId`
- `isSpeaking`
- `lastUpdatedAt`

`update_speaking_state` resolves a Discord user id to a `LobbyMember` and upserts that row. A Discord user who has not joined the lobby is ignored.

The bot watches voice state for the channel ids stored on `Lobby` and `GameTable`. A speaking start or stop sends only the user id, the channel, and `isSpeaking`. Rapid toggles are debounced. The target is under 500ms from the Discord change to the subscribed row.

The client subscribes to `SpeakingState` and draws from those rows. It never opens a Discord voice connection.

[#104](https://github.com/arkajyotiMukherjee/discordcardgames/issues/104) draws the indicators:

- In the lobby, a member speaking in the lobby voice channel gets a small speech bubble with three dots next to their name.
- At the table, a seated member speaking in that table’s voice channel gets a glow around the seat and the same bubble near the name plate.
- The indicator turns off when `isSpeaking` is false, with a short fade.
- A web-only member with no speaking row shows no indicator.
- If speaking state is missing because the bot is down, show no indicator. Do not block the game.

[#103](https://github.com/arkajyotiMukherjee/discordcardgames/issues/103) is optional. The bot records which mapped members are in the lobby voice channel and which are in a table voice channel. The client shows a small headset on that lobby row or seat. Web-only members never show the headset. This is presence, not speaking, and it still carries no audio.

## Out of scope

- Recording.
- Transcription.
- Audio processing.
- Cross-lobby voice.
- Permission systems beyond this lobby and these table voice channels.
