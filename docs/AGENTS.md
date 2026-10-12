# Docs

The plan for the card room. These files describe scenes, drivers, and games the code does not implement yet.

Conventions: [../repo-conventions.md](../repo-conventions.md).

## Files

- `architecture.md` — lobby, tables, seats, client vs SpacetimeDB, future `GameRules` and `GameDriver` shapes.
- `implementation.md` — milestone order from the skeleton through more games and Discord.
- `discord-bot-architecture.md` — Discord bot, voice channels, identity, and speaking indicators.
- `ui-ux.md` — in-canvas layout, 960×540, integer scaling, pixel buttons.

Prettier ignores `docs/`. Match the plain markdown already in these files.

## Changes

Update a doc when you change the plan it describes. Keep names aligned with the module when you write about something that already exists: tables are `Lobby`, `LobbyMember`, `GameTable`, `GameSeat`, `GameEvent`, `VoicePresence`, `SpeakingState`, `TableCleanupSchedule`, `RoomCaps`, and `LobbyIdleConfig` (`LobbyIdleSweep` is the private schedule); reducers in the module are `create_lobby`, `set_lobby_discord_channel`, `set_lobby_discord_voice`, `clear_lobby_discord_voice`, `close_lobby`, `set_lobby_idle_timeout`, `close_idle_lobbies`, `join_lobby`, `join_lobby_with_discord`, `update_speaking_state`, `update_voice_presence`, `create_game_table`, `set_table_discord_voice`, `clear_table_discord_voice`, `remove_game_table`, `clean_empty_tables`, `set_empty_table_idle_timeout`, `join_table`, `leave_table`, `handle_game_intent`, and `set_room_caps`. `Lobby.discordChannelId` is empty for a web lobby. A web `LobbyMember` has an empty `discordUserId`. `discordGuildId`, `discordLobbyVoiceChannelId`, and `GameTable.discordVoiceChannelId` stay empty until the bot stores a voice channel. `discord-bot/` calls `create_lobby`, then `set_lobby_discord_channel`, for `/cardroom create`, then `set_lobby_discord_voice` when Discord accepts the lobby voice channel. `/cardroom status` reads `Lobby`, `LobbyMember`, and `GameTable` and does not call a reducer. A join URL with a Discord user id stores that id and uses the mapped default name.

The running code is the check for current behavior. `architecture.md` still lists Discord and the card-game rules that are not in `server/src/index.ts`. The module registers the `dummy` counter, Bluff (`bluff`), President (`president`), Go Fish (`go_fish`), Crazy Eights (`crazy_eights`), Rummy (`rummy`), Blackjack (`blackjack`), Spades (`spades`), Hearts (`hearts`), and Poker (`poker`). `handle_game_intent` appends a `GameEvent` after each applied intent. `GameScene` draws Bluff with `BluffDriver`, President with `PresidentDriver`, Go Fish with `GoFishDriver`, Crazy Eights with `CrazyEightsDriver`, Rummy with `RummyDriver`, Blackjack with `BlackjackDriver`, Spades with `SpadesDriver`, Hearts with `HeartsDriver`, and Poker with `PokerDriver`: the local hand is face up, other hands are backs, and the pile is in the center. President also draws the rank order. Go Fish draws a face-down stock and books beside each seat. Crazy Eights draws the discard face up and a wild eight's named suit. Rummy draws melds by the seat that played them, plus the stock and discard pile. Blackjack draws the dealer hand, player hands, and bets. Spades uses `SpadesDriver` on the same hand layout, with partnership bids and the trick in the center. Hearts uses `HeartsDriver` on the same table: the trick sits toward the center, and taken hearts and the queen of spades stay beside the seat that won them. A Bluff, President, Go Fish, Crazy Eights, Rummy, Blackjack, Spades, or Hearts table stays in `phase: "lobby"` until `join_table` has seated `minPlayers`. When that state is `phase: "finished"`, both clients draw the subscribed winner. Create Table offers Bluff, President, Go Fish, Crazy Eights, Rummy, Blackjack, Spades, Hearts, and Poker from the shared definitions. A Poker table chooses Hold'em, Omaha, or Oklahoma when it is created. Poker draws hole cards, the board, the pot, and Fold, Check, Call, Bet, and Raise. `GameScene` has a `?` control that opens a How to Play overlay with the table's `GameDefinition.howToPlay`.

## Leave alone

Do not paste the Pixel Poker Pack, its raw files, or a long license reprint into these docs. The pack stays in `card-assest -pack`, and the privacy rule is in `README.md` and `repo-conventions.md`.

Do not treat `client/src/module_bindings/` as hand-written API. It is generated from the module.
