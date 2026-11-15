# Shared prize-pool badge

The approved [concept](approved-concept.png) is implemented as one shared canvas badge: dark-green rectangle, gold outline and trophy, gold PRIZE POOL caption, and a prominent ivory chip amount. Header player-count metadata is removed from Bluff and President. All seven entry-fee games receive the badge; Poker and Blackjack retain their separate casino pot/stack presentations.

Older game layouts keep their existing phase HUD in the free header center. Their hand/win counter yields the header space; their game boards, cards and controls have not undergone a full layout migration.

## Running-app screenshots

| Game | Desktop 1440×900 | Touch 844×390 | Touch 667×375 |
| --- | --- | --- | --- |
| President | [Desktop](president-desktop.png) | [Phone](president-mobile.png) | [Small phone](president-small-mobile.png) |
| Bluff | [Desktop](bluff-desktop.png) | [Phone](bluff-mobile.png) | [Small phone](bluff-small-mobile.png) |
| Go Fish | [Desktop](go_fish-desktop.png) | [Phone](go_fish-mobile.png) | [Small phone](go_fish-small-mobile.png) |
| Crazy Eights | [Desktop](crazy_eights-desktop.png) | [Phone](crazy_eights-mobile.png) | [Small phone](crazy_eights-small-mobile.png) |
| Rummy | [Desktop](rummy-desktop.png) | [Phone](rummy-mobile.png) | [Small phone](rummy-small-mobile.png) |
| Spades | [Desktop](spades-desktop.png) | [Phone](spades-mobile.png) | [Small phone](spades-small-mobile.png) |
| Hearts | [Desktop](hearts-desktop.png) | [Phone](hearts-mobile.png) | [Small phone](hearts-small-mobile.png) |
| Large exact pool | [Desktop](president-large-desktop.png) | [Phone](president-large-mobile.png) | [Small phone](president-large-small-mobile.png) |

These are unretouched screenshots from the running local app. The large-pool case funds six actual entry fees of 999,999,000 chips and displays **5,999,994,000 chips** without truncation or wrapping, using an 18px logical amount font. Ordinary pools use 23px; the caption uses 14px. Every amount remains inside the badge and clear of Help and phase status.

## Verification

[The proof script](../../scripts/prize-pool-proof.ts) creates independent local multiplayer rooms with the supported maximum number of players for each game. One browser at a time captures desktop, wide phone and small phone, as requested for efficient UI iteration. Games use real server deals and entry fees, not fabricated client states. [proof.json](proof.json) contains measured badge text, font size, bounds and header checks for each capture; [run.log](run.log) records the run.

The run verifies:

- Identical prize treatment across all seven entry-fee games at all three viewport sizes.
- Exact amounts from retained funding, no header player-count label, and no badge text overflow.
- Older phase HUDs stay clear of the prize badge.
- A voluntary mid-game departure retains committed contributions in the pool.
- A real large pool remains exact, readable and on one line.
- No browser runtime errors.

Focused calculation tests additionally cover settled results after funding rows are removed, refunds, empty funding, unrelated table contributions and casino exclusions. Settlement uses the table's fixed entry fee and settled participant list. Refunded games do not advertise a prize to win.

Reproduce with local Vite on port 5175 and the local `room-economy-test` database on port 3000:

```sh
/workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/prize-pool-proof.ts
```

The engine inspection hook and 30fps cap are test-only route injections. No hosted deployment or PR was created.

## Checks

- Full `pnpm test`: 541 client tests passed, 1 opt-in live test skipped; normal server tests passed; Discord bot 69 passed, 6 opt-in live tests skipped.
- `pnpm typecheck`: passed across all packages and shared rules.
- `pnpm lint`: passed, including formatting; changed files also passed the final targeted lint check.
- Final `pnpm build`: passed, with the existing Vite large-bundle advisory.
- `git diff --check`: passed.
