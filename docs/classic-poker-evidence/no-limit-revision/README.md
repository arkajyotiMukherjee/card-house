# Top slider, larger betting chips, and configurable limits

Poker-only revision; no hosted deployment or PR.

- The thicker slider sits above the betting preview. The selected total sits to the left of larger stacked chips, with Confirm/Cancel alongside.
- Hosts select No limit or Pot limit independently of Hold’em/Omaha/Oklahoma. The limit persists across hands and appears in the header.
- All-in calls/bets/raises are explicitly announced. Live all-in seats display their committed total.
- Server rules enforce raising rights after short/cumulative all-ins, short-blind bring-ins and pot ceilings, main/side-pot eligibility, unmatched returns, and automatic runout. [Full decision matrix and rule references](../../poker-all-in-rules.md).

## Actual app captures

| State | Desktop | Phone 844×390 | Small phone 667×375 |
| --- | --- | --- | --- |
| Eight-player betting (phone acts) | [Waiting desktop](04-slider-selected-desktop.png) | [Phone](04-slider-selected-mobile.png) | [Small phone](04-slider-selected-small-mobile.png) |
| Eight players before betting | [Desktop](01-preflop-desktop.png) | [Phone](01-preflop-mobile.png) | [Small phone](01-preflop-small-mobile.png) |
| Winner focus | [Desktop](07-showdown-desktop.png) | [Phone](07-showdown-mobile.png) | [Small phone](07-showdown-small-mobile.png) |
| No-limit all-in, Oklahoma discards | [Desktop](08-all-in-announced-desktop.png) | [Phone](08-all-in-announced-mobile.png) | — |
| No-limit slider reaches full stack | [Desktop](14-no-limit-slider-desktop.png) | [Waiting phone](14-no-limit-slider-mobile.png) | — |
| Host chooses limit | [Pot-limit Hold’em](12-desktop-pot-limit-host-choice.png) | [No-limit Oklahoma](13-mobile-no-limit-host-choice.png) | — |

[Mobile motion recording](mobile-motion.mp4) ([original WebM](mobile-motion.webm)). Captures are unretouched; the video is transcoded without changing content.

## Proofs and checks

- [Eight independent players](proof.json): default pot-limit Oklahoma, real touch slider input/confirmation, accepted chip movement, shared state, both discards, folded-hand privacy, winner focus, spectator review.
- [Two independent no-limit players](edge-proof.json): desktop slider reaching a full-stack 400-chip all-in above the opening pot, calls locking betting without extra checks, four Oklahoma discard actions, top-up validation/resumption, fold privacy and leave.
- [Host-choice results](host-choice.json): actual desktop and touch create-table flows, including pot-limit Hold’em and no-limit Oklahoma. Selector input persists to the server table state and seats its creator.
- [Rules regression checks](rules.txt), [full tests](tests.txt), [typecheck](typecheck.txt), [lint](lint.txt), [build](build.txt).
- Browser logs: [eight-player](browser.txt), [heads-up](heads-up-browser.txt), [host selector](host-choice-browser.txt).

The client suite passes 526 tests (one optional test skipped); normal server checks and 69 Discord tests also pass (six optional Discord tests skipped). The build keeps its existing bundle-size advisory. New rule cases receive a separate targeted rerun after the full suite.

Proofs use disposable local SpacetimeDB and Vite, Chromium desktop/touch emulation, and test-only engine access capped at 30 FPS. Physical iPhone Safari remains untested. Work remains at the Poker review checkpoint.
