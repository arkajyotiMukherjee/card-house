# President classic-table review

President now uses the approved classic table family. Quiet unboxed names and exact card counts surround the felt; the latest public combination and rank-strength guide occupy the center. The personal band gives most of its width to readable cards and reserves a compact column for Play/Pass. Finish order replaces the public combination at the end, with the President and entry-fee prize in the personal status area.

This is a local implementation checkpoint. No PR or hosted deployment was created.

## Screenshots

All images are unretouched captures from the running app, not generated mockups.

| State | Desktop, 1440×900 | Touch, 844×390 | Touch, 667×375 |
| --- | --- | --- | --- |
| Six-player opening | [Desktop](01-six-player-opening-desktop.png) | [Phone](01-six-player-opening-mobile.png) | [Small phone](01-six-player-opening-small-mobile.png) |
| Pair to beat | [Desktop](04-pair-to-beat-desktop.png) | [Phone](04-pair-to-beat-mobile.png) | [Small phone](04-pair-to-beat-small-mobile.png) |
| Triple to beat | [Desktop](04-larger-combination-desktop.png) | [Phone](04-larger-combination-mobile.png) | [Small phone](04-larger-combination-small-mobile.png) |
| First player out | [Desktop](05-first-player-out-desktop.png) | [Phone](05-first-player-out-mobile.png) | [Small phone](05-first-player-out-small-mobile.png) |
| Complete finish order | [Desktop](06-finish-order-desktop.png) | [Phone](06-finish-order-mobile.png) | [Small phone](06-finish-order-small-mobile.png) |
| Three-player large hands | [Desktop](08-large-hand-desktop.png) | [Phone](08-large-hand-mobile.png) | [Small phone](08-large-hand-small-mobile.png) |
| Selection across pages | [Desktop](09-cross-page-selection-desktop.png) | [Phone](09-cross-page-selection-mobile.png) | [Small phone](09-cross-page-selection-small-mobile.png) |

[Six-player spectator](07-six-player-spectator-spectator.png) shows final standings without a private hand or player actions. The three-player deal has 18/17/17 cards; the captured local opening player has 17 cards, and the 18-card opponent keeps compact backs with an exact count. Selected/inspected cards intentionally lift into the felt, matching the approved interaction.

## Verified behavior

[scripts/classic-president-proof.ts](../../scripts/classic-president-proof.ts) creates a real local multiplayer room with six independent SDK identities. Independent browser contexts render two players at desktop and both phone sizes. The host does not fabricate client game state: opening Play, another player's desktop Pass, subsequent combinations and all other moves go through the running server reducers. Every screenshot waits for the subscribed state to agree with the SDK state.

The run checks:

- Six-player classic composition, no duplicate legacy seat labels, and readable names/counts.
- Empty Play disabled; touch hold inspects without selecting; tap selects and Play submits the opening 3♣.
- Another player's desktop Pass, five passes clearing the trick, and the original leader receiving the next lead.
- Real pairs and triples; only the latest combination is displayed instead of historical trick cards.
- Opponent fans stay centered over their labels after a viewport resize.
- All six finish positions, titles and points; no private opponent cards revealed at the end; Play/Pass hidden after finish.
- Spectator view without a personal hand.
- Three-player 17/18-card hands, width-dependent pages, and selection retained across pages and resizing.
- Header Help, Chat and Leave callbacks, including leaving classic mode safely.
- No browser runtime errors.

Machine-readable results: [proof.json](proof.json). Console output: [run.log](run.log).

Reproduce against the local Vite app on port 5175 and local `room-economy-test` database on port 3000:

```sh
/workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-president-proof.ts
```

`PRESIDENT_PREVIEW=1` uses a single browser for faster visual iteration. Browser inspection hooks and the 30fps cap are injected by the test route; neither is shipped.

## Checks

- `pnpm test`: 537 client tests passed, 1 opt-in live test skipped; normal server suites passed; Discord bot 69 passed, 6 opt-in live tests skipped.
- `pnpm typecheck`: passed across client, server, bot and shared rules.
- `pnpm lint`: passed, including formatting.
- `pnpm build`: passed. Vite retains its existing large-bundle advisory.
- `git diff --check`: passed.

The migration changes presentation, not President's move legality, scoring or prize-settlement rules. Shared hand/back geometry was extracted from Bluff without changing its approved layout. Pause for user review before the next game.
