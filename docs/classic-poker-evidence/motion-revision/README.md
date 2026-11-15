# Rectangular controls, winning-hand focus, and chip motion

This Poker-only revision adds:

- Rectangular navigation/top-up buttons to match the betting controls.
- A countdown presentation containing only the winning showdown hand and community cards, with larger winning cards, a rank caption, and Next for split pots. Losing hands disappear, including a local losing hand. Uncalled private hands remain hidden.
- A bet/raise slider with legal increments, exact min/max endpoints, keyboard arrows/Home/End, a growing chip preview, and explicit confirmation/cancellation.
- Cosmetic chip flights from contributors to the pot and from the pot to winning stacks, based on accepted server state. Reduced-motion preferences suppress the flights. Balances and settlement remain server-owned.

## Running-app evidence

[Watch the mobile recording](mobile-motion.mp4) ([original WebM](mobile-motion.webm)). It contains the touch slider, chip preview, accepted bet movement, hand progression, and payout/countdown presentation. This is an actual local browser recording, transcoded without modifying its content.

| State | Desktop | Phone 844×390 | Small phone 667×375 |
| --- | --- | --- | --- |
| Preflop | [Desktop](01-preflop-desktop.png) | [Phone](01-preflop-mobile.png) | [Small phone](01-preflop-small-mobile.png) |
| Bet slider | [Desktop](04-bet-stepper-desktop.png) | [Phone](04-bet-stepper-mobile.png) | [Small phone](04-bet-stepper-small-mobile.png) |
| Selected amount and chip preview | [Desktop](04-slider-selected-desktop.png) | [Phone](04-slider-selected-mobile.png) | [Small phone](04-slider-selected-small-mobile.png) |
| Winner focus | [Desktop](07-showdown-desktop.png) | [Phone](07-showdown-mobile.png) | [Small phone](07-showdown-small-mobile.png) |

The old `bet-stepper` screenshot filename is retained by the proof harness; the image contains the new slider. The desktop result shows a local winner, while the phone result shows an opponent winning. Images are unretouched; phone testing uses Chromium touch emulation rather than physical Safari hardware.

The [eight-player proof](proof.json) uses independent identities and real reducers, three player viewports, and a separate spectator review. It exercises touch slider selection/confirmation and accepted bet animation, both Oklahoma discards, long-press inspection, chat/help, shared state, winner-only focus, and spectator exit. The [heads-up proof](edge-proof.json) verifies all-in runout, top-up feedback/resumption, fold privacy, and exit. The earlier [hierarchy revision](../hierarchy-revision/README.md) retains comparison images.

Code-check logs: [tests](tests.txt), [typecheck](typecheck.txt), [lint](lint.txt), [build](build.txt). Browser logs: [eight players](browser.txt), [heads-up](heads-up-browser.txt). The build retains its existing bundle-size advisory. Optional external/live tests remain skipped by the normal test command.

All proofs run against disposable local SpacetimeDB/Vite. A test-only route exposes the engine and caps headless rendering at 30 FPS; neither hook ships in the app. Work stays at the Poker review checkpoint. No PR, hosted update, or deployment is included.
