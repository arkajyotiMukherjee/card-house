# Hearts classic-table review

Hearts supports exactly four independent players. Its UI now uses the shared classic felt, readable Bree Serif/Chakra Petch typography, unboxed rail names, scene-owned gold trophy prize badge and full personal hand band.

## Composition

- Running game score is primary, because the lowest total wins. Cards remaining and points captured in the current hand are supporting values.
- Server clockwise order matches the viewed table: the next seat is on the viewer's left, the opposite player is above, and the previous seat is on the right. Left/right/across pass targets therefore agree with the physical rail positions.
- Thirteen private cards are grouped by suit/rank and use shared width-aware paging. Three selected pass cards retain selection across pages and resize; selection is only a small lift at normal card scale. Hold/hover alone inspects cards.
- Pass direction and target appear once in the public state surface. The compact personal action shows selected count and only enables a three-card pass. A submitted pass becomes a waiting state.
- The current trick has four separated card slots with owner labels and clear led-suit/hearts-broken metadata. Public cards are larger than private rail backs; no historical private hand is exposed.
- Scores opens a bounded public table with independently reserved total-score and hand-penalty columns. Long names may truncate without hiding points. Taken hearts and the queen of spades are summarized by their public penalty contribution instead of growing an overlapping card fan.
- Opening Scores clears/suppresses hand inspection and selection lift. The public trick and action controls return when it closes.
- A completed hand updates the running scoreboard. Moon detection uses public score deltas (zero to the shooter and 26 to every opponent), with full-name feedback. Final results rank low scores, retain tied leaders and describe shared prizes without printing remaining opponent cards.

## Local verification

The proof uses real authenticated local SDK identities and actual pass/play reducers. Desktop and phone are separate player identities, and the phone is resized between 844×390 and 667×375. Engine inspection/HMR freeze are test-only route injections.

```sh
/workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-hearts-proof.ts

# A retained phone completes the match; desktop and spectator reviews run sequentially.
HEARTS_SINGLE_VIEW=1 /workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-hearts-proof.ts
```

Use local Vite on port 5175 and `room-economy-test` on port 3000. `HEARTS_PREVIEW=1` runs one phone browser for visual iteration. No PR, commit, push or hosted deployment is part of this UI checkpoint.

The one-view preview completed 53 legal server play intents into the next hand. Actual touch selected three cards across both hand pages, submitted the pass and played a card. It also checked a hold gesture did not select. [Selected pass](preview/02-three-selected-across-pages-mobile.png), [owner-labelled trick](preview/05-owner-labelled-trick-mobile.png), and [public queen-of-spades penalty detail](preview/07-scores-and-queen-mobile.png) are unretouched running-app captures.

Focused validation passed 23 tests: Hearts input (6), existing layout/rule presentation (10), classic composition and moon-score deltas (5), and shared Hearts/Spades new-hand transitions (2). Client typecheck and targeted ESLint passed. The moon test verifies three opponents gain 26 while the shooter gains zero; it does not claim a naturally played moon occurred in the browser preview.

## Completed multiplayer review

The independent desktop/phone run verified both authenticated players could select and play through the real canvas and that both subscribed to the same public trick. Its input/capture trace is [two-player-input.log](two-player-input.log). That initial synthetic continuation advanced SDK moves faster than the retained desktop could apply them, so its terminal screen was not accepted as proof. Some in-hand desktop images from that run show intentional mouse hover inspection following a play. The desktop opening is a resting layout; the capture helper now moves the mouse off cards before screenshots.

The paced [retained proof](retained-final/proof.json) then passed 572 legal play intents with four authenticated players, synchronizing the retained phone after every completed trick, pass and hand boundary. It completed eleven hands, naturally produced a shoot-the-moon, and reached the 100-point match threshold. Ben Harrison won with 67; the other totals were 68, 95 and 108. A fresh desktop player saw the same final board. A fifth authenticated identity reviewed the results as a spectator on desktop and both phone sizes, without receiving a private hand. Help, Chat, Escape and Leave Table passed. No page errors occurred; all contexts, browser and SDK connections closed. [Run log](retained-final/run.log).

| State | Evidence |
| --- | --- |
| Four-player, thirteen-card opening | [Resting desktop](01-four-player-pass-desktop.png), [844 touch](retained-final/01-four-player-pass-mobile.png), [667 touch](retained-final/01-four-player-pass-small-mobile.png) |
| Three selections across pages, retained through resize | [Touch](retained-final/02-three-selected-across-pages-mobile.png) |
| Owner-labelled public trick | [Touch](retained-final/05-owner-labelled-trick-mobile.png) |
| Hearts broken and public Q♠ penalties | [Broken state](retained-final/06-hearts-broken-mobile.png), [Scores](retained-final/07-scores-and-queen-mobile.png) |
| Pass rotation and hold hand | [Right](retained-final/08-pass-right-mobile.png), [Across](retained-final/09-pass-across-mobile.png), [Hold](retained-final/10-hold-hand-mobile.png) |
| Naturally played moon | [Full shooter name and updated totals](retained-final/11-shot-the-moon-mobile.png) |
| Final low-score board, full winner name and prize | [Desktop](retained-final/12-final-scores-and-prize-desktop.png), [844 touch](retained-final/12-final-scores-and-prize-mobile.png), [667 touch](retained-final/12-final-scores-and-prize-small-mobile.png) |
| Spectator results, no private hand | [Desktop](retained-final/13-spectator-results-spectator.png), [844 touch](retained-final/13-spectator-results-spectator-mobile.png), [667 touch](retained-final/13-spectator-results-small-mobile.png) |

All images are unretouched Chromium captures. Phone checks use touch emulation; physical iPhone Safari was not part of this local review. The migration changes presentation and input handling, not Hearts rules or payout calculations.
