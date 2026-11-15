# Short horizontal pot stacks

The main pot now shares the betting preview's face sprites, 1.6 scale and 4px layer spacing. Repeated denominations split into balanced piles of at most four chips and spread horizontally. Up to nine piles fit inside the existing 280×100 pot-chip area; larger illustrations remain bounded, with the numeric amount authoritative.

## Layout previews

These images deliberately inject pot amounts into the local renderer to inspect dense artwork; they are **visual fixtures, not live wagers**. Server state and balances are unchanged and the real table is restored before gameplay testing.

| Pot | Desktop | Phone 844×390 | Small phone 667×375 |
| --- | --- | --- | --- |
| 800: two four-chip piles | [Desktop](visual-fixture-pot-800-desktop.png) | [Phone](visual-fixture-pot-800-mobile.png) | [Small phone](visual-fixture-pot-800-small-mobile.png) |
| 10,000: three short piles | [Desktop](visual-fixture-pot-10000-desktop.png) | [Phone](visual-fixture-pot-10000-mobile.png) | [Small phone](visual-fixture-pot-10000-small-mobile.png) |
| 9,999: nine denomination piles | [Desktop](visual-fixture-pot-9999-desktop.png) | [Phone](visual-fixture-pot-9999-mobile.png) | [Small phone](visual-fixture-pot-9999-small-mobile.png) |
| Very large bounded illustration | [Desktop](visual-fixture-pot-1000000395-desktop.png) | [Phone](visual-fixture-pot-1000000395-mobile.png) | [Small phone](visual-fixture-pot-1000000395-small-mobile.png) |

The renderer checks each chip's bounds against the pot-chip area in all three viewports. Layout tests verify denomination sums for ordinary/dense pots, four-chip height limits, nine-pile limits, and retaining smaller denominations in huge pots.

## Running-game verification

After restoring the actual subscribed state, the [eight-player proof](proof.json) exercises real actions, touch betting, shared state, both Oklahoma discards, winner focus and an eight-seat spectator. [Actual flop screenshot](03-flop-betting-mobile.png).

All 528 client tests pass (one optional live test skipped). [Tests](tests.txt), [typecheck](typecheck.txt), [lint](lint.txt), [build](build.txt), [browser log](browser.txt). The build retains its existing bundle-size advisory. Touch checks use Chromium emulation rather than physical Safari hardware.

No server rule changes, PR, merge or hosted deployment.
