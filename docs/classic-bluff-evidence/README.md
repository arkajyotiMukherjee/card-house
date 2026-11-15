# Bluff classic-table review checkpoint

Latest layout: [wider hands and compact controls](space-revision/README.md). Terminology/centering follow-up: [Flush](flush-revision/README.md). The screenshots below preserve the initial five-card review for comparison.

Bluff now adopts the approved Poker visual hierarchy while retaining its own game rules and six-player maximum. The [design guidelines](../design-system.md#bluff-adoption-checkpoint) record the composition, privacy rules, interaction states, and next-game review gate.

- Shared readable fonts, rectangular controls, gold-outlined Leave Table, unboxed names, compact private backs, exact card counts and a flat personal band.
- Thirteen rank choices in a readable two-row picker. Called rank and latest claim have a quiet unoutlined surface to separate them from table decoration.
- Five readable hand cards per page on desktop and touch. Selection persists across pages; holding inspects without selecting. Larger hands add pages instead of shrinking the cards.
- Play/Pass follow the turn. Challenge remains available outside the turn when the rules allow it. Disabled Play has no active caption hit target.
- Waiting/action/challenge/result information lives in the personal band. Full winner names and the entry-fee prize remain clear; remaining private hands are never exposed at the finish.

## Running-app screenshots

| State | Desktop | Phone 844×390 | Small phone 667×375 |
| --- | --- | --- | --- |
| Six-player opening and rank picker | [Desktop](01-six-player-lead-desktop.png) | [Phone](01-six-player-lead-mobile.png) | [Small phone](01-six-player-lead-small-mobile.png) |
| Selection across hand pages | [Desktop](02-cross-page-selection-desktop.png) | [Phone](02-cross-page-selection-mobile.png) | [Small phone](02-cross-page-selection-small-mobile.png) |
| Claim, pile and out-of-turn Challenge | [Desktop](03-live-claim-desktop.png) | [Phone](03-live-claim-mobile.png) | [Small phone](03-live-claim-small-mobile.png) |
| Actual 20-card pile | [Desktop](04-twenty-card-pile-desktop.png) | [Phone](04-twenty-card-pile-mobile.png) | [Small phone](04-twenty-card-pile-small-mobile.png) |
| Actual 25-card pickup hand | [Desktop](05-twenty-five-card-hand-desktop.png) | [Phone](05-twenty-five-card-hand-mobile.png) | [Small phone](05-twenty-five-card-hand-small-mobile.png) |
| Passed seats and hand browsing | [Desktop](06-passed-seats-and-page-desktop.png) | [Phone](06-passed-seats-and-page-mobile.png) | [Small phone](06-passed-seats-and-page-small-mobile.png) |
| Winner and 120-chip prize | [Spectator desktop](07-winner-and-prize-spectator.png) | [Phone](07-winner-and-prize-mobile.png) | [Small phone](07-winner-and-prize-small-mobile.png) |

[Six-player spectator layout](06-six-player-spectator-spectator.png). Screenshots are unretouched and use real subscribed state, not design-image fixtures.

## Proof and checks

The [multiplayer proof](proof.json) uses six independent identities, three browser viewports and a separate spectator. Actual canvas input selects a rank, inspects a held card without selecting it, selects cards across pages, plays them and challenges outside the turn. Real reducers build a 20-card pile and return it to the host, producing a 25-card hand. The run continues to a real winner/settlement and verifies privacy, Help, Chat and safe exit.

A separate [single-view input and resize check](preview-proof.json) ([log](preview.txt)) checks disabled/active Play targets and the responsive layout without loading several browsers during UI iteration. Layout regressions cover five-card face bounds, thirteen distinct rank targets, compact backs even for a 54-card hand, and the six-player spectator. Full-name event text has a regression check too.

[Tests](tests.txt): 532 client tests pass (one optional live test skipped), all normal server rule checks pass, and 69 Discord tests pass (six optional Discord tests skipped). [Typecheck](typecheck.txt), [lint](lint.txt), [build](build.txt), [multiplayer browser log](browser.txt). A [targeted rerun](targeted-tests.txt) passes all 33 Bluff/layout/action-message checks after the final input and resize fixes. The build retains its existing bundle-size advisory.

Testing uses isolated local SpacetimeDB/Vite and Chromium desktop/touch emulation, not physical iPhone Safari. Test-only engine access and the headless FPS cap do not ship. No game rules, server schema, PR, merge or hosted deployment changed. Other games wait for the user's next authorization after Bluff review.
