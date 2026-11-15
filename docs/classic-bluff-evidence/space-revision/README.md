# Wider Bluff hands, compact controls, and one home for public state

This revision gives the local hand the width previously reserved for repeated status text and a large controls area.

- All nine opening cards fit without paging on desktop, 844×390 touch and 667×375 touch. Card faces retain their existing sizes; desktop cards have an eight-pixel visual gap and phone cards a four-pixel gap at the base width.
- Larger hands use a width-aware page capacity. A 25-card hand shows nine per page on the tested desktop, eleven on the wider phone, and eight on the smaller phone. Capacity updates on resize; hand order and cross-page selections persist.
- Controls stay inside a 184-pixel column at the far right. One action centers vertically, two stack, and three place Play/Pass above Challenge. Pass remains available when legal; Challenge still works outside the turn. Blank control space is no longer filled with duplicate claim text.
- The header shows the actual table name. Called rank and last-player/card-count information live once in the center. There is no repeated claim or rank-selection prompt beside the buttons, and no redundant zero-selected label.
- Played cards have a clear gap below the claim surface. The winner's name is displayed separately from its label, keeping it prominent in the compact result area.

## Screenshots from the running app

| State | Desktop | Phone 844×390 | Small phone 667×375 |
| --- | --- | --- | --- |
| Nine opening cards, no pager | [Desktop](01-six-player-lead-desktop.png) | [Phone](preview/01-six-player-lead-mobile.png) | [Small phone](01-six-player-lead-small-mobile.png) |
| Single central claim and clear card gap | [Desktop](03-live-claim-desktop.png) | [Phone](03-live-claim-mobile.png) | [Small phone](03-live-claim-small-mobile.png) |
| Real 25-card hand | [Desktop](05-twenty-five-card-hand-desktop.png) | [Eleven cards per page](preview/05-wide-phone-large-hand-mobile.png) | [Eight cards per page](05-twenty-five-card-hand-small-mobile.png) |
| Selected cards across pages and three legal actions | [Desktop](06-cross-page-selection-desktop.png) | — | [Small phone](06-cross-page-selection-small-mobile.png) |
| Compact winner result | — | [Phone](preview/07-compact-winner-mobile.png) | — |

Screenshots are unretouched and use real subscribed game state and actual reducer actions. The opening and large-hand phone shots use a single rendered browser with the same six independent player identities, reducing browser load during UI review.

## Verification

[Six-player multiplayer proof](proof.json): desktop plus two touch viewports, a separate six-seat spectator, nine visible opening cards, actual Play/Challenge/Pass actions, a real 25-card challenge pickup, selection across pages, winner/settlement, privacy, Help/Chat/Leave, and responsive opponent alignment. It asserts the table-name heading, no duplicate bottom claim, compact action widths, and the minimum gap above the played cards.

[Single-view dense-hand proof](preview/proof.json): eleven cards per page on the wider phone; resizing to 667×375 changes a 25-card hand from three to four pages and restoring the viewport changes it back. It also verifies disabled/active Play and the readable winner name.

[Client tests](tests.txt): 533 pass, one optional live test skipped. Layout tests check ordinary and 25/54-card hands at multiple widths, fixed readable card sizes, paging margins, legal-control geometry, and public-card spacing. [Typecheck](typecheck.txt), [lint](lint.txt), [build](build.txt), [multiplayer log](browser.txt), [single-view log](preview.txt). A final [targeted rerun](targeted-tests.txt) passes all 15 Bluff layout/input/challenge checks. The build retains its existing bundle-size advisory.

[Updated design guidelines](../../design-system.md#bluff-adoption-checkpoint). Local Vite/SpacetimeDB only; touch testing is Chromium emulation rather than physical Safari hardware. No game rules, PR, merge or hosted deployment changed.
