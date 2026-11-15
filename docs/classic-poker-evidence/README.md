# Classic Oklahoma implementation checkpoint

Latest: [motion and winning-hand revision](motion-revision/README.md) adds rectangular controls, winner-only countdown cards, a bet slider, and chip transfers. The previous [hierarchy revision](hierarchy-revision/README.md) prioritizes cards/chips, uses quieter unboxed names, and moves waiting/actions/results into a dynamic personal bar. The [alignment revision](alignment-revision/README.md) and images below preserve the earlier checkpoints for comparison.

This is the running Poker UI, built from the approved [classic-table concept](../poker-layout-concepts/A-classic-table.png). The shared [design system](../design-system.md) documents the palette, readable Bree Serif typography, rail seats, bottom personal band, public/private card rules, responsive behavior, and requirements for future games. Other games have not been migrated in this checkpoint.

## Screenshots

Every image below is an unretouched Playwright capture of the local app. Desktop is 1440×900, mobile is 844×390 with touch enabled, and small mobile is 667×375 with touch enabled. Captures wait for the subscribed state and community-card flip animations to settle.

| State | Desktop | Mobile | Small mobile |
| --- | --- | --- | --- |
| Eight players, four private cards | [Preflop](01-preflop-desktop.png) | [Preflop](01-preflop-mobile.png) | [Preflop](01-preflop-small-mobile.png) |
| Flop, discard one of four | [Discard](02-flop-discard-desktop.png) | [Discard](02-flop-discard-mobile.png) | [Discard](02-flop-discard-small-mobile.png) |
| Flop, three retained cards | [Betting](03-flop-betting-desktop.png) | [Betting](03-flop-betting-mobile.png) | [Betting](03-flop-betting-small-mobile.png) |
| Bet amount selection | [Stepper](04-bet-stepper-desktop.png) | [Stepper](04-bet-stepper-mobile.png) | [Stepper](04-bet-stepper-small-mobile.png) |
| Turn, discard one of three | [Discard](05-turn-discard-desktop.png) | [Discard](05-turn-discard-mobile.png) | [Discard](05-turn-discard-small-mobile.png) |
| Turn, two retained cards | [Betting](06-turn-two-cards-desktop.png) | [Betting](06-turn-two-cards-mobile.png) | [Betting](06-turn-two-cards-small-mobile.png) |
| Showdown, two folded hands stay hidden | [Showdown](07-showdown-desktop.png) | [Showdown](07-showdown-mobile.png) | [Showdown](07-showdown-small-mobile.png) |

An [eight-seat spectator view](11-spectator-eight-seats.png) verifies that all eight player clusters fit without adding a personal hand or betting controls.

Heads-up edge cases:

| State | Desktop | Mobile |
| --- | --- | --- |
| Called all-in, complete board | [All-in](08-headsup-all-in-desktop.png) | [All-in](08-headsup-all-in-mobile.png) |
| Zero-stack player adds chips | [Top-up](09-top-up-shared-desktop.png) | [Top-up](09-top-up-shared-mobile.png) |
| Uncalled fold win, private opponent hand | [Hand complete](10-uncalled-private-desktop.png) | [Hand complete](10-uncalled-private-mobile.png) |

## Multiplayer proof

[`proof.json`](proof.json) records the successful eight-player run from `scripts/classic-oklahoma-proof.ts`:

- Eight independent authenticated player identities and a ninth spectator.
- Three player browser contexts: desktop and two touch sizes. They receive the same subscribed game state after actual actions. The spectator is checked separately to limit concurrent browser load.
- Full player names, readable type sizes, non-overlapping rail clusters, a reserved personal band, and header/fullscreen alignment.
- Real touch Help and Chat controls, native text entry, and a replicated chat message.
- A held card neither discards nor invokes native page selection; a short tap discards exactly one card. Oklahoma progresses from four to three to two cards.
- The phone Bet control, amount increment, and confirmation send a real betting action.
- Folded hands stay hidden; only six showdown contenders reveal their retained cards. Revealed opponent cards use the personal hand's resting scale.
- Spectators have no personal hand or betting actions, and the classic Leave control returns to the lobby.
- No browser runtime errors.

[`edge-proof.json`](edge-proof.json) records the successful two-player run from `scripts/classic-poker-edge-proof.ts`. A called all-in runs through both required Oklahoma discard steps and reveals the complete board without extra checking rounds. The zero-stack player uses the actual Top up form to add 40 chips; the funded balance updates and the shared countdown starts the next hand. A real Fold button click then ends that hand, shows all remaining board cards, and exposes no opponent hole cards. The phone's Leave control returns to the lobby without a browser error.

## Code checks

- Client suite: 515 passed, one skipped.
- Poker rules and completed-hand/session lifecycle checks passed.
- Final layout, input, viewport, and notice regression checks: 66 passed across nine files.
- Workspace TypeScript checks, lint/format checks, and production build passed.

Logs: [client suite](client-tests.txt), [final targeted regressions](targeted-tests.txt), [Poker rules](poker-rules.txt), [lifecycle](poker-lifecycle.txt), [typecheck](typecheck.txt), [lint](lint.txt), and [build](build.txt). The production build retains the existing bundle-size advisory.

## Reproduction and limits

These proofs run against a disposable local SpacetimeDB (`room-economy-test` at `127.0.0.1:3000`) and Vite (`127.0.0.1:5175`). They do not deploy or write to a hosted room.

```sh
pnpm --filter discord-bot exec tsx ../scripts/classic-oklahoma-proof.ts
pnpm --filter discord-bot exec tsx ../scripts/classic-poker-edge-proof.ts
```

The scripts use `/usr/bin/chromium`, expose the engine through a test-only route override, and cap rendering at 30 FPS in that route to keep software-rendered headless browser load manageable. Neither hook nor cap is shipped in the app. Browser contexts are closed at the end of each proof. Touch emulation checks the responsive UI and gestures; it is not a physical iPhone/Safari verification.

This is a Poker review checkpoint. There is no PR or deployment for this batch. Review the implementation screenshots before applying the design to the next game.
