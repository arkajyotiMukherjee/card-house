# Poker hierarchy and dynamic personal bar

This revision follows the request to reduce visual competition and prioritize cards and chips.

- **Primary:** full-size cards, the 32px pot amount, 28px personal stack, and 22px opponent stacks.
- **Secondary:** unboxed 17px player names and quiet 16px seat-specific information. Chakra Petch is used for names, descriptions, and metadata; Bree Serif is reserved for key amounts, headings, and results.
- **Surfaces:** the personal band has a quiet top divider instead of a gold outline. Names have no nested frames. The pot uses an unoutlined tonal surface. Navigation and top-up controls use a subdued border.
- **Public table:** the duplicate central action/winner banner is removed. Community cards move from y=322 to y=350. The chip area grows to 280×100, with up to six piles of eight visible chips; the numeric pot is authoritative for compressed large amounts.

The right side of the bottom band changes with the local state:

| State | What appears |
| --- | --- |
| Waiting / watching | Whose turn it is and the latest action, using full player names; no betting controls |
| Local betting turn | Call/check/bet instruction and legal betting choices |
| Oklahoma discard | Direct card-selection instruction; no betting choices |
| Bet/raise amount entry | Amount, legal range, and stepper controls |
| Finished hand | Winner or split-pot result, winning hand summary, shared countdown or paused state, and Top up when available |
| Rejected action | A temporary error inside the status/control area, clear of all cards, blocking clicks through the error |

`pokerPersonalMode` drives content and control visibility together. Hidden controls lose their captions and hit targets. Poker rules, chip accounting, and private-card reveal rules remain server-owned.

## Actual screenshots

These are unretouched captures from the local running app. Desktop is 1440×900. Phone sizes are 844×390 and 667×375 with Chromium touch emulation, not physical iPhone/Safari verification. Earlier revisions remain in the parent directory for comparison.

| State | Desktop | Phone | Small phone |
| --- | --- | --- | --- |
| Waiting, preflop | [Desktop](01-preflop-desktop.png) | [Phone](01-preflop-mobile.png) | [Small phone](01-preflop-small-mobile.png) |
| Flop discard | [Desktop](02-flop-discard-desktop.png) | [Phone](02-flop-discard-mobile.png) | [Small phone](02-flop-discard-small-mobile.png) |
| Flop betting / local controls | [Desktop](03-flop-betting-desktop.png) | [Phone](03-flop-betting-mobile.png) | [Small phone](03-flop-betting-small-mobile.png) |
| Bet stepper | [Desktop](04-bet-stepper-desktop.png) | [Phone](04-bet-stepper-mobile.png) | [Small phone](04-bet-stepper-small-mobile.png) |
| Turn discard | [Desktop](05-turn-discard-desktop.png) | [Phone](05-turn-discard-mobile.png) | [Small phone](05-turn-discard-small-mobile.png) |
| Turn, two retained cards | [Desktop](06-turn-two-cards-desktop.png) | [Phone](06-turn-two-cards-mobile.png) | [Small phone](06-turn-two-cards-small-mobile.png) |
| Result in personal bar | [Desktop](07-showdown-desktop.png) | [Phone](07-showdown-mobile.png) | [Small phone](07-showdown-small-mobile.png) |

Also verified the [eight-player spectator layout](11-spectator-eight-seats.png), [called all-in](08-headsup-all-in-mobile.png), invalid top-up feedback on the requesting player's [desktop](09-invalid-topup-desktop.png) / [phone](09-invalid-topup-mobile.png) view, [successful top-up](09-top-up-shared-mobile.png), and [uncalled hand completion](10-uncalled-private-mobile.png). A warning appears only for the client that submitted the invalid amount.

## Verification

The [eight-player proof](proof.json) uses eight independent player identities and a ninth spectator. It checks desktop and both touch sizes, quieter unboxed names, chip hierarchy, centered text and hands, the lower board, and betting controls appearing only for the acting player. Actual Help/Chat, touch discard, long-press inspection, the bet stepper, both Oklahoma discard steps, showdown privacy, replicated state, and spectator exit are exercised. The [heads-up proof](edge-proof.json) covers all-in runout, paused results, rejected top-up feedback in the personal bar, successful funding and resumption, fold privacy, and leaving through the header.

One visible browser was used for the initial small-phone preview. The final multiplayer review uses three player views, then closes them before the spectator review. The two-player edge-case run is separate. As in the [original evidence](../README.md), a test-only route exposes the engine and caps headless rendering at 30 FPS. Those hooks are absent from the shipped app.

```sh
CLASSIC_EVIDENCE_DIR=../docs/classic-poker-evidence/hierarchy-revision/ \
  pnpm --filter discord-bot exec tsx ../scripts/classic-oklahoma-proof.ts
CLASSIC_EVIDENCE_DIR=../docs/classic-poker-evidence/hierarchy-revision/ \
  pnpm --filter discord-bot exec tsx ../scripts/classic-poker-edge-proof.ts
```

The [design-system guide](../../design-system.md) records the revised hierarchy, type scale, surfaces, and state transitions. Work remains at the Poker review checkpoint; no other game, PR, or deployment is included.

## Code checks

The full `pnpm test` command passed: 520 client tests passed with one opt-in live test skipped; server checks passed; 69 Discord tests passed with six opt-in live tests skipped. Workspace TypeScript checks, repository lint, and the production build passed. The build retains its existing bundle-size advisory.

Logs: [full tests](tests.txt), [typecheck](typecheck.txt), [lint](lint.txt), [build](build.txt), [eight-player browser proof](browser.txt), [heads-up browser proof](heads-up-browser.txt).
