# Discord bot

Slash commands for the card room. This package is not the SpacetimeDB module and it does not run game rules.

Conventions: [../repo-conventions.md](../repo-conventions.md). The plan is [../docs/discord-bot-architecture.md](../docs/discord-bot-architecture.md).

## Files

- `src/index.ts` — starts the interactions server. Registers `/cardroom create` when `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` are set. When the token is set, watches lobbies and tables and creates or deletes voice channels.
- `src/commands.ts` — the slash command list. Later commands are added to `SLASH_COMMANDS`.
- `src/interactions.ts` — routes a Discord interaction to a subcommand. `/cardroom create` passes `guild_id` through.
- `src/lobby-client.ts` — calls `createLobby({})` on the generated client, then `setLobbyDiscordChannel`.
- `src/discord-http.ts` — Discord REST calls with rate-limit waits. A limit longer than the budget fails the voice call and leaves play running.
- `src/recorded-discord.ts` — in-memory Discord API that records create and delete. Tests use it when the live token is unauthorized.
- `src/voice-channels.ts` — lobby and table voice channel names, create, delete, and the subscription watch.
- `src/join-url.ts` — `{CARDROOM_PUBLIC_URL}/{code}`.
- `src/voice-presence.ts` — `recordVoiceState` sends a user id and voice channel id to `update_voice_presence`, skipping channels the module does not store. `syncGuildVoice` applies a guild's voice states and clears rows for users who are gone.
- `src/voice-gateway.ts` — Discord gateway client for `GUILDS` and `GUILD_VOICE_STATES`. Passes user and channel ids to those handlers. It never reads or stores audio.
- `src/server.ts` — Express `POST /interactions` with the Discord signature check.
- `src/*.test.ts` — command shape, reply text, rate limits, and the signature check. `create-lobby.live.test.ts` and `voice-channels.live.test.ts` send one signed `POST /interactions` when `CARDROOM_LIVE=1`. `web-without-bot.live.test.ts` deals a web lobby without starting this process. `voice-presence.test.ts` uses fixture voice states and a fake gateway socket.

The generated client is `client/src/module_bindings/`. Do not hand-edit it.

## Changes

`/cardroom create` reads `channel_id` and `guild_id` from the interaction. `create_lobby` mints the code. `set_lobby_discord_channel` stores that text channel on `Lobby.discordChannelId`. The bot then creates `#room-{code}-voice` and calls `set_lobby_discord_voice`. The reply is still the code and the join URL. A Discord error or rate limit skips the voice channel and still returns the lobby.

A new `GameTable` in a lobby that has `discordGuildId` gets a channel such as `#ab3d-bluff-1`, stored with `set_table_discord_voice`. A finished or removed table loses that channel. `close_lobby` makes the bot delete the lobby channel and any table channels still open.

When `DISCORD_BOT_TOKEN` is set, `src/index.ts` also opens the voice gateway and records who is in the lobby or a table voice channel through `update_voice_presence`. The token is sent only in Identify and is never logged.

Keep new commands on this service. Do not put reducer logic here. A bad channel id is rejected before the reducer, and the module rejects it again.

## Leave alone

Do not add `/cardroom status`, a Discord display name, a Launched from Discord badge, speaking state, in this package until those issues are in scope.

Do not commit a bot token, application id, or public key.

Do not start this process from `scripts/bootstrap.sh`. The module publish stays there.
