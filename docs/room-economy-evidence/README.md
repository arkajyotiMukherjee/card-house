# Room economy validation evidence

These captures come from the local cloud test app and an isolated `room-economy-test` SpacetimeDB database. They contain test players, not production balances. No hosted application was deployed and no live Discord messages were sent.

## Screenshots and behavioral proof

| Change | Screenshots | Verification |
| --- | --- | --- |
| Configurable room grant; one wallet per browser | [Starting grant](01-starting-grant-desktop.png), [initial leaderboard](02-leaderboard-desktop.png) | `grants-rejoin-ownership` rejects another identity's wallet and prevents a second grant on re-entry. |
| Host configures game entry fees | [Entry fee form](03-entry-fee-desktop.png), [creator joins as host](04-creator-host-desktop.png) | `reservations-and-atomic-create` verifies refunds and rollback of unfunded creation. The browser checks the actual host, seat, and reserved balance. |
| Leaderboard is the default lobby view | [Desktop](05-room-rankings-desktop.png), [phone](06-room-rankings-mobile.png) | Two independent browser contexts show shared rankings and their own wallets. |
| Chat closed by default, opens from a compact button | [Open chat](07-compact-chat-desktop.png), [phone unread indicator](08-unread-chat-mobile.png) | One player sends a message; the other sees the unread indicator. |
| Configurable poker stakes and chosen buy-ins | [Desktop form](09-poker-stakes-desktop.png), [phone form](10-poker-stakes-mobile.png), [funded desktop table](13-funded-poker-desktop.png), [phone table](14-funded-poker-mobile.png) | `poker-funded-all-in`, `poker-cashout`, and `poker-between-hand-entry` verify configurable blinds, unequal buy-ins, runout, conservation, and an 800-coin late buy-in without minting chips. |
| Full-table countdown and durable hosting | [Desktop countdown](11-full-countdown-desktop.png), [phone countdown](12-full-countdown-mobile.png) | Lifecycle proof covers 10-second automatic start/cancellation, creator return, 60-second host transfer, and waiting-seat refunds. |
| Exact settlement and readable results after seats release | [Poker result](15-settled-poker-result.png), [pooled winner balance](21-pooled-prize-winner.png) | All seven entry-fee games finish through real multi-user reducers. Unit checks cover tied and team prizes; result snapshots retain participant names and identify all tied winners. |
| House-funded Blackjack and full casino rules | [Insurance](16-blackjack-insurance.png), [split hands](17-blackjack-split.png) | Real browser play finds insurance and a split. Rule tests cover exact 3:2/half-coin payouts, peek, even money, insurance, late surrender, split limits/aces, double rules, six-deck reuse/cut, and soft 17. Live reducers verify house settlement, top-up, new-player entry, and safe exit before betting. |
| Rankings survive different games; grants/refills excluded | [Desktop rankings](18-cross-game-leaderboard-desktop.png), [phone rankings](19-cross-game-leaderboard-mobile.png), [tracked refill](20-tracked-refill-ranking.png) | The losing player refills from zero; their negative settled profit remains unchanged. Casino transfers do not count as profit. |
| CPU takeover retains the original wallet and frees departed membership | — | Lifecycle proof covers 30-second takeover, no CPU wallets, original-player payout after both players leave the room, release of departed membership, and re-entry without another grant. |
| Discord leaderboard command and one updated message | — | Recorded API tests cover linked-room selection, pagination/ties, mentions, coalesced updates, rate-limit retry, restart recovery, and recovery of a POST accepted before its delivery record was saved. |
| Retired competition schema removed without erasing active games | — | [Migration proof](migration-proof.json) preserves one room, three tables, two seats, and exact game states, including an active poker hand. [Runbook](../room-economy-migration.md) describes staged maintenance and recovery. |

## Machine-readable results

- [Multi-user game and wallet proof](live-proof.json): four independent identities; all seven entry-fee games, ownership, reservation, poker, and Blackjack scenarios.
- [Lifecycle proof](lifecycle-proof.json): six independent identities; actual countdown, absence, host-transfer, CPU, and refill timers.
- [Browser proof](browser-proof.json): two users at desktop 1440×900 and touch/mobile 844×390, live UI flows, and no rendering errors.
- [Migration proof](migration-proof.json): staged local upgrade, no database reset.
- [Automated test output](automated-tests.txt), [final server checks](server-tests.txt), [type checks](typecheck.txt), [lint](lint.txt), [production build](build.txt).

## Reproduce

Use installed dependencies and publish the module **only to an isolated local** `room-economy-*` database. Regenerate bindings as described in the server guide. Start Vite with `SPACETIMEDB_HOST=ws://127.0.0.1:3000 SPACETIMEDB_DB=room-economy-test` on port 5175, then run:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:economy:live
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium pnpm test:economy:browser
```

The live harness writes private browser credentials to `/tmp/room-economy-fixtures.json` with mode 0600. Do not commit that file. The browser harness uses those credentials and captures evidence here; it only accepts a loopback app URL. `ROOM_ECONOMY_URL` can select another local Vite port. The live scripts reject hosted databases.

Chromium desktop and touch emulation passed. This cloud image lacks WebKit's native libraries, so no Safari/iPhone browser compatibility result is claimed. Discord checks used recorded API responses, and six pre-existing optional live Discord/module tests remain skipped. Production migration, deployment, and real Discord delivery remain unexecuted.
