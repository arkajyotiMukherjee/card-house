# Shared hand layering fix

The pointer-focused card always draws in front of selected and easing neighbours. Selection adds a modest lift at resting size; it no longer permanently magnifies Bluff or President cards. Equal inspection lifts and resting selected cards retain left-to-right order, keeping each card’s left rank/suit corner visible. Fixed hit targets preserve one-card taps.

Hover ownership follows the nearest card instead of accumulating collider enter events. This also prevents a missed leave event on an overlapping neighbour from keeping the hand enlarged. A new move can resume inspection even when Excalibur does not emit another enter. All nine game drivers forward focus to the shared layer, including Poker and Blackjack’s animation clocks.

## Unretouched running-app screenshots

| State | Screenshot |
| --- | --- |
| Desktop: selected left card, hovered right neighbour fully in front | [Desktop](01-desktop-selected-left-hover-right.png) |
| Desktop: two selected cards at resting size, left corners readable | [Desktop](02-desktop-selected-pair-rest.png) |
| Desktop: focus moved left, above the selected right neighbour | [Desktop](03-desktop-hover-left-of-selected.png) |
| Touch: selected left card, hold the right neighbour to inspect | [844×390](04-phone-selected-left-hold-right.png) |
| Touch: scrub left, focus follows without changing selection | [844×390](05-phone-scrub-left.png) |
| Touch: release and select two readable cards | [844×390](06-phone-selected-pair-rest.png), [667×375](07-small-phone-selected-pair-rest.png) |

## Proof

[Script](../../scripts/hand-layering-proof.ts) · [Machine-readable results](proof.json)

The proof creates an actual two-player paid Bluff table on the isolated local database, with 27 cards per player. One browser context runs at a time: desktop, then touch. Real mouse clicks/moves and native touch hold/slide/release verify that the focused card is above every other hand card, selected cards return to resting scale and stable order, holding never selects, and resize/paging preserve the two selected cards. Both independent authenticated SDK identities retain the same authoritative game state: inspection and selection submit no game action. Browser errors are empty; all contexts and SDK clients close in finally.

The engine inspection hook, 30fps cap and env-preserving HMR freeze exist only in the proof route. No debug hook is shipped. Reproduce with Vite on port 5175 and local room-economy-test on port 3000:

```sh
/workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/hand-layering-proof.ts
```

Sixteen new regression tests exercise focus switching before easing catches up, left-to-right order, stale overlap release, reacquisition without enter, selected size, and the integration path in all nine drivers. The focused hover/hit/inspection suite passes 44 tests. Full workspace checks also pass: [590 client tests, server suites and 69 bot tests](tests.txt), [typecheck](typecheck.txt), [lint/Prettier](lint.txt), [build](build.txt), and `git diff --check`. One optional live client test and six live bot tests remain skipped. [Focused tests](focused-tests.txt) and [browser output](browser.txt) are included. Physical iPhone Safari is not claimed.
