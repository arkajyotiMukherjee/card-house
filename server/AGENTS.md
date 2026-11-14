# Server

SpacetimeDB owns rooms, seats, game rules, wallets, and settlement. This package is not an HTTP server. Follow [repo conventions](../repo-conventions.md). Keep table names PascalCase, columns camelCase, and reducers snake_case. Reject invalid calls with `SenderError`.

`src/index.ts` declares schema and reducers. Register shared `GameRules` and `GameDefinition` values through `src/rules-by-type.ts`; do not duplicate game definitions here. Pure helpers and rule tests live next to the module. `pnpm --filter server test` runs strip-types tests. `*.live.test.ts` opt in separately; the room economy integration scripts run through the Discord package's `tsx` runner against a local `room-economy-*` database.

## Room economy

Read [room economy behavior](../docs/room-economy.md). `RoomWallet` stores available half-coins, grants, and settled profit. `WalletOwner` privately binds each wallet to the authenticated sender. `WalletLedger` is private and idempotent. Public `TableFunding` reserves a seat's entry fee or casino stack for its original wallet, including CPU-controlled seats. `GameSettlement` preserves monetary results and participant names after paid seats are released. Keep grants and transfers out of profit.

Creation, seating, funding, and host assignment are atomic. Table creators auto-join. Hosting is durable and independent of seat order. Server schedules enforce the full-table countdown, CPU takeover, and absent-host transfer. A returning player cannot take another wallet or reclaim a transferred host role.

Entry-fee games settle once per complete game. `src/game-prizes.ts` normalizes winners, including tied scored games and Spades teams. Poker and Blackjack settle actual per-seat chip deltas per hand, not winner flags. Never return a casino stack before all wagers and claims are resolved. Never let legacy or solo chips enter a room wallet. House-funded Blackjack is intentionally not zero-sum among players.

The module stores game JSON on `GameTable`. Shared rules decide legal moves; the client sends intents and renders subscribed state. All wallet-affecting operations require authenticated ownership. Private `OperatorSession` records bind a sender to the room/client session; a public client id or unverified Discord identity is insufficient authority.

## Lifecycle and generated API

Normal cleanup removes unused tables and idle rooms, while result watchers keep completed paid results readable for the review window. Voice channel ids remain until the Discord bot clears them. `SpeakingState` and `VoicePresence` carry ids and speaking flags only, never audio. Solo rooms use CPU strategies and never create wallet grants or paid rankings.

After schema/reducer changes, publish to an isolated local database, regenerate all of `client/src/module_bindings/`, and typecheck. Do not hand-edit generated bindings. `scripts/bootstrap.sh` remains the ordinary local setup path.

This release removes obsolete competition schema. Existing populated databases require [the staged migration](../docs/room-economy-migration.md), not a direct publish or database reset. Private `RoomUpgrade` and `TableBackup` records support the temporary bridges; only the archiving operator can restore, and replay is rejected. Keep scheduled jobs paused while restoration is pending. Do not deploy to a hosted database until explicitly authorized.
