# Walkable Casino

The approved [casino concept](lobby-casino-concepts/B-walkable-casino.png) establishes the visual direction. The playable floor uses original sprites, walnut fixtures, patterned rugs, and brass trim. The entrance and table scenes share those materials. Card play, chip actions, and table themes keep their existing controls.

## Floor and table flows

- Reception is the starting point. The wallet and chip refill use the existing room economy. Clicking a lounge chair walks to it and claims it on arrival. Walking away, losing the connection, or opening a table releases it.
- The gaming floor extends into irregular wings as tables are created. Each table keeps its slot for its lifetime. Finished and abandoned tables follow the existing table cleanup policy.
- Click or tap the floor to walk. Desktop also supports holding the arrow keys or WASD. The floor and the table directory show stakes, host, and seated count. Walk over to a table to sit down or watch. Paid seating confirms the entry fee or buy-in before changing the wallet.
- The scrollable leaderboard ranks room wallets by net winnings and shows online, lounge, table, and offline status. Selecting a player opens their location or table. The local avatar can be edited at the entrance or in the floor footer.
- Desktop `/` opens free-text quick chat, Enter sends, and Esc closes. The Chat button opens history on both desktop and touch devices. A recent room message can appear over the sender on the floor, then expires. Table chat has its own history.
- Free rooms support 16 concurrent humans including reserved seats, and 3 live tables. Pro test rooms support 100 humans and 25 live tables. Room-tier changes require an operator. The planned Pro price is $5 per month. Billing is outside this release.

The lobby subscribes to room-scoped table summaries, wallet, occupancy, movement, and chat. Full table state is fetched when opening a table. Walking starts on the local client, and the server validates routes against the shared terrain grid. Only placed tables block their slots. Players can cross paths. Lounge seats are exclusive. Leaving a running hand removes the player from the visible seated count while the game holds their seat for its existing return period. Reduced-motion users see movement without camera easing or animated walking frames.

## Discord setup

Use the same persistent bot identity the leaderboard uses. Run the bot with its configured session file. Get the bot’s **public** SpacetimeDB identity from its connection. Use database-owner credentials to grant the identity the `discord` role.

```sql
INSERT INTO "CasinoOperator" (identity, role)
VALUES ('<bot-public-identity-hex>', 'discord');
```

A new database grants the publisher the `admin` role at initialization. For an existing database, provision an admin identity the same way with role `admin`. Assign an individual room using `set_casino_room_tier` with its internal lobby ID and the value `pro` or `free`. Lowering a tier preserves current wallets and tables. New capacity is enforced on later joins and creation.

Set these variables on the Discord bot service.

| Variable | Value |
| --- | --- |
| `DISCORD_OAUTH_CLIENT_SECRET` | The secret for the application identified by `DISCORD_APPLICATION_ID`. |
| `DISCORD_OAUTH_REDIRECT_URI` | The registered public bot callback ending in `/casino/discord/callback`. |
| `CARDHOUSE_DISCORD_CHAT` | Set to `1` after allowing Message Content in the Discord developer portal. |

Allow the bot to view and read the linked voice channels and their built-in text chat. Channel creation uses Manage Channels. Moving members uses Move Members, and monitoring speaking metadata requires Connect. Register the callback with the exact scheme, host, and path. The browser build uses the existing `CARDROOM_BOT_URL` for the OAuth entry point.

The [production workflow](hostinger-deployment.md) publishes the game client and database, then deploys the Discord bot to `bot.arkaive.studio`. Check `GET /casino/discord/status` after rollout. The response reports the running commit and whether the OAuth settings and database connection are ready. An `available: true` response enables the button. Complete an OAuth sign-in to verify the registered redirect, client secret, and database operator role.

The callback returns the browser to `CARDROOM_PUBLIC_URL`, including when authorization is cancelled or fails. Card House displays the result in the avatar editor. If it reports that the bot needs permission, use the public identity logged at startup to check the `CasinoOperator` grant. The runtime log also identifies token exchange or profile lookup failures without logging credentials.

OAuth uses the identify scope, a short-lived browser-bound challenge, and PKCE. Guests keep their appearance in browser storage. Once verified, the same Discord account can restore the appearance on another browser. Only mapped voice-channel text is mirrored. Ordinary guild text, DMs, bot messages, webhooks, and attachment-only posts stay outside the bridge. The bridge handles edits and deletions and deduplicates by Discord message ID. The module checks the subscriber's active room or table before delivering mirrored messages.

A connected verified user can follow their game session from room voice to table voice and back. Moves require the source channel to match Discord gateway presence. If Discord permissions block a move, use Discord's own voice-channel controls. Speaking indicators use voice control metadata. Run the bot on Node.js 22.12 or newer with optional dependencies installed so its voice client can load Discord’s DAVE encryption support. The bot monitors one occupied channel in each guild, favoring room voice, then the most occupied table. Other linked channels retain headset presence.

## Verification

Publish to an isolated local `room-economy-*` database before running the checks from the repository root.

```sh
pnpm --filter discord-bot exec tsx ../scripts/casino-floor.live.ts
SPACETIMEDB_DB=room-economy-test pnpm --filter client exec vite --host 127.0.0.1 --port 5181
pnpm --filter discord-bot exec tsx ../scripts/casino-floor.browser.ts
```

The load test provisions temporary local operator identities using owner SQL. Set `CASINO_SPACETIME_CLI` or `CASINO_SPACETIME_ROOT` when the CLI uses a nonstandard path. The browser script accepts `CASINO_CHROMIUM`, `CASINO_BROWSER_URL`, and `CASINO_EVIDENCE_DIR`. These checks use local SpacetimeDB and recorded Discord protocol fixtures. Confirm the OAuth redirect, Discord permissions, and speaking behavior in the target guild when configuring the bot.

### Browser captures

The desktop and landscape touch captures come from two browser sessions in the same room. The test used the registered wallet when confirming a paid seat and then dealt a multiplayer Bluff hand.

- [Entrance](walkable-casino-evidence/entrance.png) and [avatar editor](walkable-casino-evidence/avatar-editor.png)
- [Reception and desktop quick chat](walkable-casino-evidence/reception-chat.png)
- [Desktop gaming wing and leaderboard](walkable-casino-evidence/gaming-wing.png) and [table directory](walkable-casino-evidence/table-directory.png)
- [Touch reception](walkable-casino-evidence/mobile-reception.png), [touch gaming wing](walkable-casino-evidence/mobile-gaming-wing.png), and [touch room chat](walkable-casino-evidence/mobile-chat.png)
- [Multiplayer Bluff table](walkable-casino-evidence/bluff-table.png)
