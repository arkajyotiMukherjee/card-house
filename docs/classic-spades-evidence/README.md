# Classic Spades evidence

Spades now uses the approved classic table: the full private hand stays in the bottom band, the partner sits opposite, and opponents stay on the side rails. Names are quiet, bids and nil obligations are prominent, and a compact team board shows score, contract, tricks and bags. The gold prize badge belongs to the shared scene.

The center is reserved for bidding or the public trick. Completed tricks remain readable until the next accepted play, with owner labels and a winner caption. Scores opens a centered partnership panel and suppresses card inspection. The UI exposes only played cards; remaining hands are never revealed at the result.

## Screenshots

These are unretouched screenshots from four independent players using the running local application. The desktop and phone views were open concurrently, with state checked against the normalized subscribed server state at each stage.

| State | 1440×900 desktop | 844×390 touch phone | 667×375 touch phone |
| --- | --- | --- | --- |
| Four players, 13-card hand and bidding | [Desktop](01-four-player-bidding-desktop.png) | [Phone](01-four-player-bidding-mobile.png) | [Small phone](01-four-player-bidding-small-mobile.png) |
| Selected card and paging | [Desktop](02-selected-card-desktop.png) | [Phone](02-selected-card-mobile.png) | [Small phone](02-selected-card-small-mobile.png) |
| Completed public trick | [Desktop](03-complete-trick-desktop.png) | [Phone](03-complete-trick-mobile.png) | [Small phone](03-complete-trick-small-mobile.png) |
| Partnership details | [Desktop](04-partnership-scores-desktop.png) | [Phone](04-partnership-scores-mobile.png) | [Small phone](04-partnership-scores-small-mobile.png) |
| Spades broken | [Desktop](05-spades-broken-desktop.png) | [Phone](05-spades-broken-mobile.png) | [Small phone](05-spades-broken-small-mobile.png) |
| New hand and updated score | [Desktop](06-next-hand-score-desktop.png) | [Phone](06-next-hand-score-mobile.png) | [Small phone](06-next-hand-score-small-mobile.png) |

The complete replay ended **EW 507–NS 380 after eight hands**. [The retained player result at 844×390](canvas-final/07-winning-partnership-mobile.png) uses the test-only Canvas2D fallback. A fresh **WebGL** spectator verifies the final UI at [844×390](canvas-final/08-spectator-spectator.png) and [667×375](canvas-final/08-spectator-small-mobile.png). The four settlement participants remain visible after their paid seats are removed, and no hand cards are exposed.

## Verification

The reproducible [proof script](../../scripts/classic-spades-proof.ts) creates four distinct SDK identities and a real paid Spades table. It submits actual reducer actions, and desktop and phone also bid/play through the canvas. Rule simulation is only used to choose legal actions for replay; it does not replace or mutate browser/server state.

[proof.json](proof.json) records the combined evidence. [canvas-final/proof.json](canvas-final/proof.json) and [run.log](canvas-final/run.log) record the successful complete match, privacy and Help/Chat/Leave checks with no runtime errors. The long replay waits for every completed trick to reach the retained client.

The original two-view WebGL review passed through the next hand. Long rapid WebGL replays under the cloud SwiftShader renderer arrived late and exceeded the harness timeout; the equivalent legal reducer replay completed after using Excalibur's public `Engine.useCanvas2DFallback()` in the test route only. The final spectator uses WebGL again. [profile.json](canvas-final/profile.json) records raw pre-GC heap, actor and renderer measurements; these do not establish a retained memory leak. The production renderer and rules are unchanged. The fallback clones its canvas, so only its initial 844×390 viewport is used for screenshots; the final 667×375 screenshot uses fresh WebGL.

Focused checks passed: **18 tests** across Spades driver input, legacy helper compatibility, new classic layout/privacy tests and both real hand-transition resets. Client typecheck, targeted ESLint and Prettier passed. Final combined checks are owned by the parent task.

```sh
SPADES_SINGLE_VIEW=1 SPADES_CANVAS_REPLAY=1 /workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-spades-proof.ts
```

Run with local Vite on port 5175 and `room-economy-test` on port 3000. `SPADES_PREVIEW=1` captures one hand in one phone view; `SPADES_SINGLE_VIEW=1` runs the full game through one retained phone view, and `SPADES_CANVAS_REPLAY=1` switches only the long post-first-hand replay to the public test renderer fallback. All engine hooks, the 30fps cap and env-preserving HMR freeze exist only in test route injections. No shipped debug hook, rule change, PR or deployment is added.
