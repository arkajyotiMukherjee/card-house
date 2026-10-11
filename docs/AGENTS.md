# Docs

The plan for the card room. These files describe scenes, drivers, and games the code does not implement yet.

Conventions: [../repo-conventions.md](../repo-conventions.md).

## Files

- `architecture.md` — lobby, tables, seats, client vs SpacetimeDB, future `GameRules` and `GameDriver` shapes.
- `implementation.md` — milestone order from the skeleton through more games and Discord.
- `ui-ux.md` — in-canvas layout, 960×540, integer scaling, pixel buttons.

Prettier ignores `docs/`. Match the plain markdown already in these files.

## Changes

Update a doc when you change the plan it describes. Keep names aligned with the module when you write about something that already exists: tables are `Lobby`, `LobbyMember`, `GameTable`, `GameSeat`, and `GameEvent`; reducers in the module are `create_lobby`, `join_lobby`, `create_game_table`, `join_table`, `leave_table`, and `handle_game_intent`.

The running code is the check for current behavior. `architecture.md` still lists Discord and the card-game rules that are not in `server/src/index.ts`. The module registers the `dummy` counter, Bluff (`bluff`), President (`president`), Go Fish (`go_fish`), Crazy Eights (`crazy_eights`), Rummy (`rummy`), Blackjack (`blackjack`), Spades (`spades`), and Hearts (`hearts`). `handle_game_intent` appends a `GameEvent` after each applied intent. `GameScene` draws Bluff with `BluffDriver`, President with `PresidentDriver`, Go Fish with `GoFishDriver`, Crazy Eights with `CrazyEightsDriver`, Rummy with `RummyDriver`, Blackjack with `BlackjackDriver`, Spades with `SpadesDriver`, and Hearts with `HeartsDriver`: the local hand is face up, other hands are backs, and the pile is in the center. President also draws the rank order. Go Fish draws a face-down stock and books beside each seat. Crazy Eights draws the discard face up and a wild eight's named suit. Rummy draws melds by the seat that played them, plus the stock and discard pile. Blackjack draws the dealer hand, player hands, and bets. Spades uses `SpadesDriver` on the same hand layout, with partnership bids and the trick in the center. Hearts uses `HeartsDriver` on the same table: the trick sits toward the center, and taken hearts and the queen of spades stay beside the seat that won them. A Bluff, President, Go Fish, Crazy Eights, Rummy, Blackjack, Spades, or Hearts table stays in `phase: "lobby"` until `join_table` has seated `minPlayers`. When that state is `phase: "finished"`, both clients draw the subscribed winner. Create Table offers Bluff, President, Go Fish, Crazy Eights, Rummy, Blackjack, Spades, and Hearts from the shared definitions. `GameScene` has a `?` control that opens a How to Play overlay with the table's `GameDefinition.howToPlay`.

## Leave alone

Do not paste the Pixel Poker Pack, its raw files, or a long license reprint into these docs. The pack stays in `card-assest -pack`, and the privacy rule is in `README.md` and `repo-conventions.md`.

Do not treat `client/src/module_bindings/` as hand-written API. It is generated from the module.
