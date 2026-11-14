# Room coins and rankings

Each multiplayer room has one wallet per browser identity. The creator chooses a whole-coin starting grant, defaulting to 10,000. Reloading, renaming, leaving, and re-entering do not grant more coins. The session token owns the wallet; a public client id or Discord profile cannot claim another person's funds. Solo practice uses no room money.

The lobby defaults to a leaderboard beside the table browser. Rankings use settled net winnings, with equal profits sharing a rank. Available coins and table commitments are shown separately; total coins include both. Initial grants and refills never count as winnings. Chat is closed initially and opens from its button, with an unread indicator for new messages.

A player who cannot afford the cheapest payable table and has no committed funds can refill to the room's original grant. With no payable tables, the threshold is 20 coins. Every refill is tracked and excluded from profit.

## Entry-fee games

Bluff, President, Go Fish, Crazy Eights, Rummy, Hearts, and Spades charge the host's chosen entry fee (default 20). Joining reserves coins; leaving before the start refunds them. Starting commits all reservations atomically. One fee covers a complete game, including all internal Hearts or Spades rounds.

The winner receives the whole pool. Tied winners and winning Spades partners split it. An odd half-coin goes to the lowest winning seat first, conserving the exact pool. An invalid/no-winner outcome refunds contributions. Settlement is idempotent. Finished seats are released so another game can be joined, while a participant snapshot preserves the result, cards, and winner names.

Leaving during play keeps the paid seat reserved. After 30 seconds, a CPU acts for the original player. Winnings still reach that player's wallet, including after leaving the room. Returning to the seat stops the CPU. A player cannot reserve another paid seat until their current game finishes.

## Poker and Blackjack

Casino tables use buy-ins rather than an additional entry-fee pool. Hosts configure stake and buy-in limits, and players choose their own buy-in. New players join, and seated players top up, between hands. Remaining chips cash out only after outstanding wagers and pot claims settle. Moving coins between wallet and table never changes profit.

Poker defaults to 10/20 blinds and a 400–2,000 buy-in range. Hold'em remains no-limit; Omaha and Oklahoma remain pot-limit. Table blind settings persist between hands. All-in runouts, side pots, and unmatched refunds apply before wallet settlement.

Blackjack defaults to 10–50 wagers and a 200 minimum buy-in. The dealer has an unlimited hidden bankroll. Player losses go to the house; winnings come from the house, so Blackjack is intentionally not zero-sum among room players. Main wagers use whole coins and all accounting uses integer half-coins, including 3:2 naturals and surrender.

Blackjack uses six decks, a 75% cut, a US hole-card check, and stands on soft 17. Insurance pays 2:1; a natural can take even money against an ace. Late surrender is available on an initial unsplit hand after the check. Equal-value cards can split into at most four hands. Doubling is allowed on eligible two-card hands, including after splits. Split aces receive one card and cannot be doubled or resplit. Split-hand 21 pays even money. A ten-second review pause separates casino hands.

## Hosting

Creating a table also joins it and makes the creator its host in the same transaction. Failed funding cannot leave an empty table behind. Host identity is independent of seat order. The host can start at the game's minimum player count. A full, connected, funded table starts after ten seconds; departures cancel the countdown. The countdown appears on the table card, in the table, and in room chat.

Hosting is retained for 60 seconds of absence. After that, a connected seated human is selected randomly. Returning after a transfer does not reclaim the role. CPU takeover and host transfer use independent timers.

## Discord

`/cardhouse create startingcoins:<amount>` configures a room's grant. `/cardhouse leaderboard` selects the room linked to the current channel, or accepts `roomcode` when several rooms are linked. `page` shows additional players. The bot updates one durable leaderboard message after settled games and casino hands, disables mentions, and retries rate limits or delivery failures. It recovers an accepted message after a restart instead of posting another copy.

Keep `CARDHOUSE_BOT_SESSION_FILE` on persistent storage with restrictive permissions. Its default is `discord-bot/.session-token`, which is ignored by Git. Losing the bot's credential file changes its authenticated identity. No live Discord announcement is required to validate gameplay; recorded API tests cover delivery and recovery.

## Rollout

This change removes the retired competition mode. Existing games remain free legacy tables: their old chips never become wallet coins. Newly created tables use the economy. See [the staged migration runbook](room-economy-migration.md) before publishing to an existing database. Deployment remains a separate, explicitly requested action.
