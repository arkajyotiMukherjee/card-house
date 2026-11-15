# Poker alignment revision

Changes requested after the first Oklahoma review:

- Removed the decorative border enclosing the entire scene. The personal band and functional name/message badges remain.
- Centered names, stack/blind lines, pot text, state messages, and turn/countdown labels horizontally and vertically inside explicit content boxes. Changing countdown text is recentered as it updates.
- Moved the pot badge to the left of a larger chip area. Real denomination artwork forms bounded piles that grow with the pot, using up to six piles with five visible chips each. The numeric amount remains authoritative when a very large pot is visually compressed.
- Compensated for the shared card inspection helper's resting lift so personal cards are vertically centered in their band on desktop and touch layouts. Inspection, hit targets, tap-to-discard, and long-press behavior remain functional.

## Screenshots

Unretouched captures from the running local app. All views contain eight independently authenticated players. The two mobile sizes use Chromium touch emulation, not a physical iPhone/Safari session. The original checkpoint's screenshots remain in the parent directory for comparison.

| State | Desktop 1440×900 | Phone 844×390 | Small phone 667×375 |
| --- | --- | --- | --- |
| Preflop, four personal cards | [Desktop](01-preflop-desktop.png) | [Phone](01-preflop-mobile.png) | [Small phone](01-preflop-small-mobile.png) |
| Flop, discard | [Desktop](02-flop-discard-desktop.png) | [Phone](02-flop-discard-mobile.png) | [Small phone](02-flop-discard-small-mobile.png) |
| Flop, betting | [Desktop](03-flop-betting-desktop.png) | [Phone](03-flop-betting-mobile.png) | [Small phone](03-flop-betting-small-mobile.png) |
| Bet stepper | [Desktop](04-bet-stepper-desktop.png) | [Phone](04-bet-stepper-mobile.png) | [Small phone](04-bet-stepper-small-mobile.png) |
| Turn, discard | [Desktop](05-turn-discard-desktop.png) | [Phone](05-turn-discard-mobile.png) | [Small phone](05-turn-discard-small-mobile.png) |
| Turn, two personal cards | [Desktop](06-turn-two-cards-desktop.png) | [Phone](06-turn-two-cards-mobile.png) | [Small phone](06-turn-two-cards-small-mobile.png) |
| Showdown, folded hands hidden | [Desktop](07-showdown-desktop.png) | [Phone](07-showdown-mobile.png) | [Small phone](07-showdown-small-mobile.png) |

Also checked the [eight-player spectator view](11-spectator-eight-seats.png).

## Verification

[`proof.json`](proof.json) records the successful multiplayer run. The browser proof asserts centered label bounds and resting personal hands on all three viewports, absence of the full-scene border, and separation between the pot badge and chip stacks. It also exercises touch Help/Chat, chat delivery, long-press inspection, both Oklahoma discard steps, the betting stepper, showdown privacy, consistent state across clients, and spectator exit. No browser errors were reported.

The layout/input tests include the corrected resting center on desktop and mobile and bounded pot stack denominations. The full `pnpm test` command passed: 516 client tests passed with one opt-in live test skipped; server checks passed; 69 Discord tests passed with six opt-in live tests skipped. Client type checking, repository lint, and the production build passed. The build retains the existing bundle-size advisory.

Logs: [multiplayer browser](browser.txt), [full tests](tests.txt), [targeted input/layout tests](targeted-tests.txt), [typecheck](typecheck.txt), [lint](lint.txt), [build](build.txt).

```sh
CLASSIC_EVIDENCE_DIR=../docs/classic-poker-evidence/alignment-revision/ \
  pnpm --filter discord-bot exec tsx ../scripts/classic-oklahoma-proof.ts
```

The proof uses the same disposable local database and test-only 30 FPS cap described in the [original evidence index](../README.md). No hosted database, PR, or deployment is involved. The [design-system guide](../../design-system.md) includes these revised alignment and pot rules. Other games remain pending review.
