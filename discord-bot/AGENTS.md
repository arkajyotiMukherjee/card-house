# Discord bot

Slash commands for the card room. This package is not the SpacetimeDB module and it does not run game rules.

Conventions: [../repo-conventions.md](../repo-conventions.md). The plan is [../docs/discord-bot-architecture.md](../docs/discord-bot-architecture.md).

## Files

- `src/index.ts` — starts the interactions server. Registers `/cardroom create` when `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` are set.
- `src/commands.ts` — the slash command list. Later commands are added to `SLASH_COMMANDS`.
- `src/interactions.ts` — routes a Discord interaction to a subcommand.
- `src/lobby-client.ts` — calls `createLobby({})` on the generated client, then `setLobbyDiscordChannel`.
- `src/join-url.ts` — `{CARDROOM_PUBLIC_URL}/{code}`.
- `src/server.ts` — Express `POST /interactions` with the Discord signature check.
- `src/*.test.ts` — command shape, reply text, and the signature check. `create-lobby.live.test.ts` calls the published module when `CARDROOM_LIVE=1`.

The generated client is `client/src/module_bindings/`. Do not hand-edit it.

## Changes

`/cardroom create` reads `channel_id` from the interaction. `create_lobby` mints the code. `set_lobby_discord_channel` stores that channel on `Lobby.discordChannelId`. The reply is the code and the join URL.

Keep new commands on this service. Do not put reducer logic here. A bad channel id is rejected before the reducer, and the module rejects it again.

## Leave alone

Do not add `/cardroom status`, a Discord display name, a Launched from Discord badge, or voice channels in this package until those issues are in scope.

Do not commit a bot token, application id, or public key.

Do not start this process from `scripts/bootstrap.sh`. The module publish stays there.
