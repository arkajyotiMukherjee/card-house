# Go Fish classic-table review

Go Fish supports two to six players. This migration applies the approved classic table family and shared gold trophy prize badge while preserving its own ask/stock/book mechanics.

## Composition

- Header: actual table name, shared prize-pool badge, existing Leave/Chat/Help navigation. No header player count or duplicate phase HUD.
- Rail: compact private backs capped at four; quiet names, exact remaining-card count and a prominent books score. Active seats have a separate To ask label. Large hands change the count, not the fan footprint.
- Personal band: books are the prominent score, the held cards get most width, and card count/page is supporting information. Stable rank grouping and shared width-aware paging keep rank corners readable. A selected rank lifts slightly at resting scale; hover or hold alone enlarges it for inspection.
- Ask: tap a rank already held, choose among the five other players in a bounded central grid, then confirm with one compact Ask control. Target labels fit inside their buttons; empty-handed targets are unavailable. The server remains authoritative for move legality.
- Public play: one central surface owns the latest ask/result. The stock remains face down with an exact count. A drawn card's identity is never printed in public feedback.
- Books: the Books control opens a bounded center collection view with each owner's name, separate fixed score and all completed ranks. It suppresses card inspection and player actions until closed; private remaining hands stay private.
- Results: the public center becomes the complete books leaderboard, with tied leaders highlighted together. A single winner's full name fits the personal result column; ties use a short N tied winners status and exact full names in the leaderboard. Tied prize text says shared, not that each player receives the full pool.

The remaining games retain their existing layouts until the next user-authorized migration. No PR or hosted deployment is part of this checkpoint.

## Running-app screenshots

All screenshots are unretouched captures from the running local app. Desktop shows Ben Harrison's independent browser; phone shows Ava Bennett's browser. The phone is resized between 844×390 and 667×375 while preserving the current hand selection.

| State | Desktop 1440×900 | Touch 844×390 | Touch 667×375 |
| --- | --- | --- | --- |
| Six-player opening | [Desktop](01-six-player-opening-desktop.png) | [Phone](01-six-player-opening-mobile.png) | [Small phone](01-six-player-opening-small-mobile.png) |
| Rank and target choice | [Desktop](02-select-rank-and-target-desktop.png) | [Phone](02-select-rank-and-target-mobile.png) | [Small phone](02-select-rank-and-target-small-mobile.png) |
| Public ask result | [Desktop](03-public-ask-result-desktop.png) | [Phone](03-public-ask-result-mobile.png) | [Small phone](03-public-ask-result-small-mobile.png) |
| Actual 13-card hand | [Desktop](04-large-hand-desktop.png) | [Phone](04-large-hand-mobile.png) | [Small phone](04-large-hand-small-mobile.png) |
| Three selected cards and chooser | [Desktop](05-selected-rank-dense-hand-desktop.png) | [Phone](05-selected-rank-dense-hand-mobile.png) | [Small phone](05-selected-rank-dense-hand-small-mobile.png) |
| Book collection | [Desktop](06-book-collection-desktop.png) | [Phone](06-book-collection-mobile.png) | [Small phone](06-book-collection-small-mobile.png) |
| Final books and prize | [Desktop](07-final-books-and-prize-desktop.png) | [Phone](07-final-books-and-prize-mobile.png) | [Small phone](07-final-books-and-prize-small-mobile.png) |

[Six-player spectator](08-six-player-spectator-spectator.png) shows public completed books without a private hand or Ask controls.

The observed dense hand has **13 cards**, with **two pages at both phone widths**. The three selected 3s stay at resting scale and clear all five target controls on the small phone. Selection survives both page navigation and resizing. The stock caption has its own quiet tonal surface so the rail ornament cannot merge with the count.

## Verification

[The proof script](../../scripts/classic-go-fish-proof.ts) creates a real local six-player game using six independent SDK identities. Desktop and phone send actual canvas asks, and the views are compared against normalized subscribed server state after each screenshot stage. Scripted later asks also go through real server reducers; no game state is fabricated in a browser.

The final run passed:

- Maximum six-player player/spectator compositions; no duplicate legacy names or status HUD.
- Empty Ask is disabled; long press inspects without selecting; tap chooses a held rank.
- Long target names fit inside measured buttons, with ellipsis preserving neighboring controls.
- Rank → target → Ask from two independent players, with accepted replicated state changes.
- Actual 13-card hand; phone paging at readable size; three selected cards and visible chooser verified with non-vacuous count/bounds assertions.
- Book collection opened/closed; all hand inspection and selected lift suppressed while viewing books.
- Complete game result, public book ranks and exact scores, with remaining private-hand rendering restricted to the local owner.
- Spectator, Help, Chat and Leave interactions; leaving clears the stored table.
- No browser runtime errors.

[proof.json](proof.json) records the results. Its dense-hand observation values are taken from the linked unretouched screenshots; the reproducible script now records those page/card counts directly on subsequent runs. [run.log](run.log) contains the successful final run.

Focused checks: **17 tests passed** across Go Fish driver input, legacy helper compatibility, and new classic layout/ranking tests. Client typecheck and targeted ESLint passed. The final root task runs the combined project checks after both agents' browser proofs close.

```sh
/workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-go-fish-proof.ts
```

Run against local Vite on port 5175 and `room-economy-test` on port 3000. `GO_FISH_PREVIEW=1` uses one browser. Engine inspection hooks, the 30fps cap and env-preserving HMR freeze are test-only route injections. No product debug hook, hosted deployment, or PR is added.


## Combined final checks

After both agents closed their browser/SDK clients, the parent task verified the combined implementation:

- `pnpm test`: **551 client tests passed**, 1 opt-in live client test skipped; normal server suites (including new side-pot cases) passed; Discord bot 69 passed, 6 opt-in live tests skipped.
- `pnpm typecheck`: passed for client, server, bot and shared rules.
- `pnpm lint`: passed, including formatting.
- `pnpm build`: passed; Vite retains the existing large-bundle advisory.
- `git diff --check`: passed.

No PR, commit, push or production deployment was created.
