# Room chips and rankings

Each multiplayer room has one wallet per browser identity. The creator chooses a whole-chip starting grant, defaulting to 10,000. Reloading, renaming, leaving, and re-entering do not grant more chips. The session token owns the wallet; a public client id or Discord profile cannot claim another person's funds. Solo practice uses no room money.

The lobby defaults to a leaderboard beside the table browser. Rankings use settled net winnings, with equal profits sharing a rank. Available chips and table commitments are shown separately; total chips include both. Initial grants and refills never count as winnings. The floor footer shows your room net winnings. The list scrolls with the mouse wheel, scrollbar, or a touch swipe. A pixel crown follows the single positive-profit leader’s name; zero-profit initial ties and tied leaders have no crown. Chat is closed initially and opens from its button, with an unread indicator for new messages.

A player at reception who cannot afford the cheapest payable table and has no committed funds can refill to the room's original grant. With no payable tables, the threshold is 20 chips. Every refill is tracked and excluded from profit.

**Lifetime winnings** on the main menu sum the positive chips earned after stakes on settled multiplayer results. Solo practice, payouts that only return the stake, and transfers do not count. Losses affect the room's net ranking and leave the lifetime winnings total unchanged. The total uses the signed-in SpacetimeDB identity and survives room cleanup. Past results count when their ledger entries still exist. Previously purged rooms have no settlement history to recover.

## Entry-fee games

Bluff, President, Go Fish, Crazy Eights, Rummy, Hearts, and Spades charge the host's chosen entry fee (default 20). Joining reserves chips; leaving before the start refunds them. Starting commits all reservations atomically. One fee covers a complete game, including all internal Hearts or Spades rounds.

The winner receives the whole pool. Tied winners and winning Spades partners split it. An odd half-chip goes to the lowest winning seat first, conserving the exact pool. An invalid/no-winner outcome refunds contributions. Settlement is idempotent. Finished seats are released, and a participant snapshot preserves the result, cards, and winner names. Players and spectators see the result for 10 seconds before returning to the room lobby. A completed solo game returns to the main menu. Between-hand pauses at casino tables continue to use their next-hand flow.

Leaving during play keeps the paid seat reserved. After 30 seconds, a CPU acts for the original player. Winnings still reach that player's wallet, including after leaving the room. Returning to the seat stops the CPU. A player cannot reserve another paid seat until their current game finishes.

## Poker and Blackjack

Casino tables use buy-ins rather than an additional entry-fee pool. Hosts configure stake and buy-in limits, and players choose their own buy-in. New players join, and seated players top up, between hands. Remaining chips cash out only after outstanding wagers and pot claims settle. Moving chips between wallet and table never changes profit.

A poker hand ending is separate from its paid session ending. Connected zero-stack players retain their seats and may top up between hands. Returning to a retained seat preserves its stack and does not charge a new buy-in. Top-ups have no per-session count limit: each addition is charged once, must be affordable, and must leave the stack within the table's minimum and maximum buy-in. The next-hand countdown starts only when at least two retained players have positive stacks, using one server deadline shared by every client.

After a hand settles, departed or disconnected players cash out. If fewer than two paid seats remain, the poker session ends, remaining stacks cash out, and result watchers can review the hand. An ended session accepts neither new buy-ins nor top-ups. A CPU-controlled winner belongs to the original wallet and follows the same settlement and cash-out rules. Create a new table to play another session.

Disconnecting during the top-up pause preserves the seat for the normal 30-second reconnect grace. After that grace, the settled stack cashes out and the session closes if fewer than two paid seats remain; an abandoned zero-stack seat cannot hold the session open indefinitely.

Poker defaults to 10/20 blinds and a 400–2,000 buy-in range. Hold'em remains no-limit; Omaha and Oklahoma remain pot-limit. Table blind settings persist between hands. All-in runouts, side pots, and unmatched refunds apply before wallet settlement.

Blackjack defaults to 10–50 wagers and a 200 minimum buy-in. Leaving before placing a wager returns the full buy-in and leaves net winnings unchanged. Only resolved wagers enter the settlement. The dealer has an unlimited hidden bankroll. Player losses go to the house; winnings come from the house, so Blackjack is intentionally not zero-sum among room players. Main wagers use whole chips and all accounting uses integer half-chips, including 3:2 naturals and surrender.

Blackjack uses six decks, a 75% cut, a US hole-card check, and stands on soft 17. Insurance pays 2:1; a natural can take even money against an ace. Late surrender is available on an initial unsplit hand after the check. Equal-value cards can split into at most four hands. Doubling is allowed on eligible two-card hands, including after splits. Split aces receive one card and cannot be doubled or resplit. Split-hand 21 pays even money. A ten-second review pause separates casino hands.

## Hosting

Creating a table also joins it and makes the creator its host in the same transaction. Failed funding cannot leave an empty table behind. Host identity is independent of seat order. The host can start at the game's minimum player count. A full, connected, funded table starts after ten seconds; departures cancel the countdown. The countdown appears on the table card, in the table, and in room chat.

Hosting is retained for 60 seconds of absence. After that, a connected seated human is selected randomly. Returning after a transfer does not reclaim the role. CPU takeover and host transfer use independent timers. Presence tracks individual sockets, so closing an old connection after a reconnect cannot mark its live replacement offline. Empty tables whose host has been absent for 60 seconds are retired; outstanding paid claims and occupied tables are preserved, and linked Discord voice channels are cleared before removing table rows.

## Discord

`/cardhouse create startingchips:<amount>` configures a room's grant. `/cardhouse leaderboard` selects the room linked to the current channel, or accepts `roomcode` when several rooms are linked. `page` shows additional players. The bot updates one durable leaderboard message after settled games and casino hands, disables mentions, and retries rate limits or delivery failures. It recovers an accepted message after a restart instead of posting another copy.

Keep `CARDHOUSE_BOT_SESSION_FILE` on persistent storage with restrictive permissions. Its default is `discord-bot/.session-token`, which is ignored by Git. Losing the bot's credential file changes its authenticated identity. No live Discord announcement is required to validate gameplay; recorded API tests cover delivery and recovery.

## Rollout

This change removes the retired competition mode. Existing games remain free legacy tables: their old chips never become wallet chips. Newly created tables use the economy. See [the staged migration runbook](room-economy-migration.md) before publishing to an existing database. Deployment remains a separate, explicitly requested action.

### Retiring the hands and wins counters

The production workflow runs this migration with database-owner credentials if Maincloud refuses to remove a populated `ClientStats` table. The temporary module stops writes to the old table. The script deletes only its counter rows and publishes the final schema with the usual database reset protection. Existing clients disconnect when the counter table is removed, so the workflow rolls out the matching client in the same release.

For a manual release, run the same command with the SpacetimeDB CLI and database-owner credentials.

```sh
python3 scripts/retire-client-stats.py --spacetime spacetimedb-cli \
  --server https://maincloud.spacetimedb.com --database cardhouse --allow-remote
```

For an isolated rehearsal, use a local `room-economy-*` database and omit `--allow-remote`. When the owner credentials are in a separate CLI configuration file, pass its path as `--config-path`.
