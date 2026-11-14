# Discord bot

Slash commands for the card room. This package is not the SpacetimeDB module and it does not run game rules.

Conventions: [../repo-conventions.md](../repo-conventions.md). The plan is [../docs/discord-bot-architecture.md](../docs/discord-bot-architecture.md).

## Files

- `src/index.ts` — starts the interactions server. Registers `/cardhouse create`, `/cardhouse status`, and `/cardhouse close` when `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` are set. `GET /default-player-name` uses that token to map a Discord user id. When the token is set, watches lobbies and tables and creates or deletes voice channels, and listens for speaking on those channels.
- `src/speaking.ts` — debounces speaking updates and calls `updateSpeakingState` with the user id, the channel, and the boolean.
- `src/speaking-gateway.ts` — Discord gateway probe and deafened voice control frames. UDP datagrams after discovery are dropped. A 401 does not open a socket.
- `src/commands.ts` — the slash command list. Later commands are added to `SLASH_COMMANDS`.
- `src/interactions.ts` — routes a Discord interaction to a subcommand. `/cardhouse create` passes `guild_id` through.
- `src/lobby-client.ts` — calls `createLobby({})` on the generated client, then `setLobbyDiscordChannel`. The subscription also includes `LobbyMember`, `GameTable`, and `GameSeat` so status and close can count them.
- `src/lobby-status.ts` — reads one lobby by room code and builds the status reply.
- `src/lobby-close.ts` — `/cardhouse close` calls `close_lobby` only when that lobby has no members and none of its tables have a seat.
- `src/discord-http.ts` — Discord REST calls with rate-limit waits. A limit longer than the budget fails the voice call and leaves play running.
- `src/recorded-discord.ts` — in-memory Discord API that records create and delete. Tests use it when the live token is unauthorized.
- `src/voice-channels.ts` — lobby and table voice channel names, create, delete, and the subscription watch.
- `src/discord-user.ts` — Discord `GET /users/{id}`. A 401 returns no user and no name. The default name comes from `src/shared/discord-player-name.ts`.
- `src/join-url.ts` — `{CARDROOM_PUBLIC_URL}/{code}`.
- `src/voice-presence.ts` — `recordVoiceState` sends a user id and voice channel id to `update_voice_presence`, skipping channels the module does not store. `syncGuildVoice` applies a guild's voice states and clears rows for users who are gone.
- `src/voice-gateway.ts` — Discord gateway client for `GUILDS` and `GUILD_VOICE_STATES`. Passes user and channel ids to those handlers. It never reads or stores audio.
- `src/server.ts` — Express `POST /interactions` with the Discord signature check, and `GET /default-player-name`.
- `src/*.test.ts` — command shape, reply text, the name mapping, rate limits, the signature check, speaking updates, and voice presence. `create-lobby.live.test.ts`, `voice-channels.live.test.ts`, and `status-lobby.live.test.ts` send signed `POST /interactions` when `CARDROOM_LIVE=1`. `web-without-bot.live.test.ts` deals a web lobby without starting this process. `speaking.live.test.ts` drives speaking through `updateSpeakingState` when `CARDROOM_LIVE=1`. `voice-presence.test.ts` uses fixture voice states and a fake gateway socket. `discord-user.live.test.ts` calls Discord when `DISCORD_NAME_LIVE=1` and expects a 401 with no invented user.

The generated client is `client/src/module_bindings/`. Do not hand-edit it.

## Changes

`/cardhouse create` reads `channel_id` and `guild_id` from the interaction. `create_lobby` mints the code. `set_lobby_discord_channel` stores that text channel on `Lobby.discordChannelId`. The bot then creates `#room-{code}-voice` and calls `set_lobby_discord_voice`. The reply is still the code and the join URL. A Discord error or rate limit skips the voice channel and still returns the lobby.

A new `GameTable` in a lobby that has `discordGuildId` gets a channel such as `#ab3d-bluff-1`, stored with `set_table_discord_voice`. A finished or removed table loses that channel. `close_lobby` and an idle room marked `closed` make the bot delete the lobby channel and any table channels still open. Deleting the lobby row deletes its lobby voice channel as well, so an automatic teardown does not leave the channel behind.

When `DISCORD_BOT_TOKEN` is set, `src/index.ts` also opens the voice gateway and records who is in the lobby or a table voice channel through `update_voice_presence`. The token is sent only in Identify and is never logged.

`/cardhouse status` reads `roomcode`. It looks up that `Lobby` and counts `GameTable` and `LobbyMember` rows for the lobby. An open lobby is live. The reply names the code, says live or closed, and gives those counts. A code with no row says the room was not found. Status does not call a reducer.

`/cardhouse close` reads `roomcode`. It closes the room only when that lobby has no members and no seats at its tables. A player in the lobby, or a seat at one of its tables, leaves the room open. `close_lobby` marks an empty room closed, and the voice watch then deletes that lobby's voice channel and any table voice channels still open.

`GET /default-player-name?discord_user_id=` calls Discord for that user and returns the default lobby name. A 401 responds with `name: null`. Do not fill in a user when Discord rejects the token.

Keep new commands on this service. Do not put reducer logic here. A bad channel id is rejected before the reducer, and the module rejects it again.

Speaking updates send only the Discord user id, the voice channel id, and `isSpeaking`. The gateway joins a watched channel muted and deafened. It does not read, store, log, or forward audio.

## Leave alone

Do not draw speaking indicators here. The default player name is the mapping in `src/shared/discord-player-name.ts`. Discord member columns stay on `LobbyMember` in the module.

Do not commit a bot token, application id, or public key.

Do not start this process from `scripts/bootstrap.sh`. The module publish stays there.

## Room leaderboard

`leaderboard.ts` serves `/cardhouse leaderboard` and updates one durable message per linked room after settlements. Use the rate-limited Discord REST API, disable mentions, coalesce revisions, and record delivery only after success. Recover an accepted post before creating another message after restart. `CARDHOUSE_BOT_SESSION_FILE` must persist the bot identity and remain untracked. Room creation accepts optional starting coins. Tests use recorded API responses; never invent a live Discord delivery when credentials or permissions are unavailable.
