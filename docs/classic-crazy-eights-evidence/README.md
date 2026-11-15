# Crazy Eights classic-table review

Crazy Eights now uses the approved classic table family for its supported maximum of seven players. The scene-owned prize badge remains in the header; the game UI adds quiet unboxed names, exact counts, compact backs, a readable suit state, stock/top discard and the full private-hand band.

## Composition

- Public center: current suit and wild-eight state, a bounded stock illustration and enlarged top discard. Stock and discard captions use quiet tonal surfaces so the mat ornament cannot merge with their letters. An empty stock with buried discards says **Stock 0 · Refill**, matching the server's automatic recycling behavior.
- Wild eight: selecting an eight replaces the public piles with a readable two-by-two suit chooser. Choose a suit, then confirm Play in the compact action column. The eight remains in the personal band with a modest selected lift; hover/hold enlargement is suppressed while choosing a suit.
- Personal hand: stable rank grouping, shared width-aware pages and retained selection; only hover/hold enlarges a card. The next-page controls remain inside the personal band.
- Actions: Play when there is a matching card, otherwise Draw or Pass according to the existing shared rules. Empty or unnamed-eight Play is visually disabled. The server still validates every submitted move.
- Finish: full winner name, awarded points and prize appear in the personal status column. The final discard remains public, while all remaining opponent cards stay private. Spectators never acquire a private hand or player action.

No game rules, schema or generated bindings changed. No PR or deployment was created.

## Running-app screenshots

All captures are unretouched images from actual local server games, not generated mockups.

| State | Desktop 1440×900 | Touch 844×390 | Touch 667×375 |
| --- | --- | --- | --- |
| Seven-player opening | [Desktop](01-seven-player-opening-desktop.png) | [Phone](01-seven-player-opening-mobile.png) | [Small phone](01-seven-player-opening-small-mobile.png) |
| Four-choice wild-eight suit picker | [Desktop](02-wild-eight-suit-picker-desktop.png) | [Phone](02-wild-eight-suit-picker-mobile.png) | [Small phone](02-wild-eight-suit-picker-small-mobile.png) |
| Declared suit after actual canvas play | [Desktop](03-declared-suit-desktop.png) | [Phone](03-declared-suit-mobile.png) | [Small phone](03-declared-suit-small-mobile.png) |
| Drawn card | [Desktop](06-drawn-card-desktop.png) | [Phone](06-drawn-card-mobile.png) | [Small phone](06-drawn-card-small-mobile.png) |
| Actual 13-card private hand | [Desktop](04-large-private-hand-desktop.png) | [Phone](04-large-private-hand-mobile.png) | [Small phone](04-large-private-hand-small-mobile.png) |
| Paged private hand | [Desktop](05-private-hand-next-page-desktop.png) | [Phone](05-private-hand-next-page-mobile.png) | [Small phone](05-private-hand-next-page-small-mobile.png) |
| Winner, points and prize | [Desktop](07-winner-points-and-prize-desktop.png) | [Phone](07-winner-points-and-prize-mobile.png) | [Small phone](07-winner-points-and-prize-small-mobile.png) |

[Seven-player spectator](08-seven-player-spectator-spectator.png) shows public state and counts without a private hand or player action. The final documented multiplayer run reached 13 cards; the proof JSON records that actual value.

## Verification

[The script](../../scripts/classic-crazy-eights-proof.ts) creates seven independent authenticated SDK players in a real local paid game. It searches the shared rules offline for a legal sequence, then replays every action through the actual server reducers. That selects useful dense states without replacing or fabricating browser game state. Desktop belongs to Ben Harrison; the phone is reopened for the actual owner of a wild eight or large hand. Every capture waits for all open views to agree with normalized subscribed server state.

The final run verifies:

- Maximum seven-player composition, bounded opponent fans, no legacy name/HUD duplicates.
- Four visible wild-eight choices; exactly one selected eight at resting scale and clear of the chooser.
- Touch hold inspects without selecting; actual suit and Play taps update the shared suit.
- Actual canvas Draw adds exactly one private card.
- A 13-card private hand pages on the wide phone, with small-phone paging captured after resize.
- An independent second player uses desktop canvas Play and the result replicates to the phone.
- Complete server game finish, winner points/prize and remaining-hand rendering restricted to the local owner plus the public top discard.
- Spectator, Help, Chat and Leave behavior; leaving clears the stored table.
- No browser runtime errors.

No natural no-stock Pass occurred in this run. The driver/layout tests explicitly verify the Pass-only state, forwarded Pass intent, and Draw instead of Pass when an empty stock can recycle buried discards; the proof records `passObserved: false` rather than claiming a live Pass capture.

Machine-readable [proof.json](proof.json) and [run.log](run.log) contain the successful final results.

Reproduce with local Vite on port 5175 and local `room-economy-test` on port 3000:

```sh
/workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-crazy-eights-proof.ts
```

`CRAZY_EIGHTS_PREVIEW=1` uses one browser context. Final proof uses two open views maximum, resizing the touch view for the smaller phone. Engine inspection, the 30fps cap and env-preserving Vite HMR freeze are test-route injections, never product debug hooks.

## Focused checks

- 17 tests passed: existing driver input (8), legacy helper compatibility (6), and classic composition/rank ordering (3).
- Targeted ESLint passed for changed runtime/tests/proof files.
- Real two-view multiplayer proof passed with `errors: []`.
- Parent task performs combined workspace type, lint, test and build checks after all game agents finish.
