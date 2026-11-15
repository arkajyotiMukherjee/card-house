# Accumulated lobby and poker UX fixes

Work remains local on `fix/lobby-chip-ux`. No pull request, merge, or production deployment has been triggered for this batch. The app and database used for proof are isolated local cloud services.

## Eight-player layout and showdown privacy

The current layout uses readable Chakra Petch table text, fixed opponent panels, and a central showdown review tray. The bottom band belongs to the local player: their name and playing stack on the left, centered cards in the middle, and betting controls on the right. Room balances are shown in the lobby and top-up dialog only. The Fullscreen icon is a centered four-corner SVG.

- Actual eight-identity Omaha session: [desktop during play](39-eight-player-desktop-flop.png), [phone during play](39-eight-player-mobile-flop.png), [desktop showdown](39-eight-player-desktop-showdown.png), [phone showdown](39-eight-player-mobile-showdown.png).
- [Eight-player proof](eight-player-redesign-proof.json): eight distinct identities, all eight names fit, personal controls/cards remain in the bottom band, no room wallet, centered phone Fullscreen icon, review navigation, and six eligible showdown hands after two players fold. Folded players stay listed without exposing their cards.
- A server-rejected top-up uses the reserved center status band, covering the prior status cleanly while leaving names and personal cards clear: [desktop warning](44-desktop-reserved-error-band.png), [phone warning](44-mobile-reserved-error-band.png).
- Uncalled hands have no public hole-card tray: [desktop](40-uncalled-desktop-private.png), [phone](40-uncalled-mobile-private.png). The public board remains visible.
- [Two-player card and privacy proof](card-readability-current-proof.json) checks Fullscreen alignment at 844×390 and 667×375, matching personal/review card scales, Blackjack result sizes, and card backs retained in Bluff and Rummy. Current result examples use prefixes 41–43.

The review tray starts on a winner. Arrows or an eligible player panel switch to another showdown hand. One readable hand is displayed at a time so eight four-card Omaha hands never compete for the same space. The pot, board, names, stacks, and fold/action status remain visible while reviewing.

## Earlier captures

Prefixes 35–37 and [their original proof](card-readability-proof.json) are historical size experiments. Their blanket result reveal for non-showdown games has been removed. Prefix 38 is the earlier eight-player layout that exposed the reported fan/wallet overlaps: [desktop](38-eight-player-desktop-showdown.png), [phone](38-eight-player-mobile-showdown.png), [original capture proof](eight-player-proof.json). Use prefixes 39–44 for the current design.

## Screenshots

| Report | After-change evidence |
| --- | --- |
| Space between Refill chips and Name; mobile button overflow; chips wording | [Phone lobby](06-mobile-leading-crown.png), [small phone](11-small-mobile-lobby.png), [room grant](14-starting-chips-wording.png), [entry form](13-mobile-entry-chips.png) |
| Desktop Rankings caption off-center | [Centered Rankings with chat open](03-desktop-centered-rankings.png) |
| Scrollable rankings and a crown before the clear leader | [Initial tie without crown](02-mobile-initial-no-crown.png), [clear leader](06-mobile-leading-crown.png), [desktop wheel scroll](07-desktop-scrolled-rankings.png), [phone swipe](08-mobile-scrolled-rankings.png) |
| Unexplained green status dot | [Table cards with text status only](05-desktop-leading-crown.png) |
| Clipped mobile round text and inconsistent help height | [Padded status and matching help](10-mobile-omaha-hud.png), [latest phone poker header](25-mobile-same-started-game.png) |
| Pot blending into decoration; small community cards | [Phone flop with pot badge](10-mobile-omaha-hud.png), [desktop flop](09-desktop-omaha-hud.png) |
| Desktop hover should enlarge like mobile | [Desktop card inspection](12-desktop-card-inspection.png) |
| Desktop Create Table off-center; table name missing caret | [Centered desktop dialog and caret](15-desktop-centered-create-caret.png), [mobile caret](16-mobile-table-name-caret.png) |
| Minimum buy-in changes; clipped errors | [Automatic desktop buy-in](17-desktop-auto-buy-in.png), [desktop inline error](18-desktop-inline-buy-in-error.png), [automatic mobile buy-in](19-mobile-auto-buy-in.png), [mobile inline error](20-mobile-inline-buy-in-error.png) |
| Desktop chat caret not moving | [Chat insertion point](21-desktop-chat-moving-caret.png), measured caret positions in [dialog proof](dialog-proof.json) |
| Non-host action gap and mismatched seated counts | [Host with two seats](22-host-two-seats-actions.png), [guest with two seats and compact actions](23-mobile-guest-two-seats-actions.png) |
| Cannot start or leave after losing a seat | [Released seat returns to lobby](26-released-seat-leaves-safely.png), [host starts after rejoining](24-desktop-host-starts-two-player-game.png), [same game on phone](25-mobile-same-started-game.png) |
| Oklahoma overlapping Leave/Chat | [Phone variant label on a separate row](25-mobile-same-started-game.png) |
| Table error overlapping Hands/Wins | [Desktop warning](27-desktop-error-below-header.png), [phone warning](28-mobile-error-below-header.png) |
| Completed poker accepting fresh buy-ins; zero-stack top-up and diverging clients | [Desktop zero-stack seat](29-desktop-zero-stack-can-top-up.png), [phone zero-stack seat](30-mobile-zero-stack-can-top-up.png), [desktop after top-up](31-desktop-shared-top-up-state.png), [phone after top-up](32-mobile-shared-top-up-state.png), [desktop CPU result](33-desktop-cpu-win-session-ended.png), [phone CPU result](34-mobile-cpu-win-session-ended.png) |

## Connection bug and cleanup proof

The old disconnect callback tracked identity rather than individual sockets. An overlapping reconnect reproduced a live replacement connection being marked offline when its old socket closed. The waiting-seat timeout could then remove the still-active player's seat. The UI could remain on that table and reject Leave with `Not seated`.

The fix adds a private socket registry, marks an identity offline only after its last connection closes, refreshes waiting occupancy from subscribed rows, and treats an already-released or deleted seat as a successful local exit. Waiting viewers are explicitly labeled Watching or Seat released. Start requests use server validation.

- [Before reconnect proof](seat-reconnect-before.json): replacement socket active, member incorrectly marked offline.
- [After reconnect proof](seat-reconnect-after.json): replacement stays connected, two seats survive the real 63-second wait, and the host starts successfully.
- [Twelve-player UI and cleanup proof](proof.json): desktop wheel and touch swipe, a crown after a real paid game, automatic refund and removal of an empty abandoned table after the host's 60-second grace, and preservation of an occupied game.
- [Dialog and two-browser lifecycle proof](dialog-proof.json): real canvas controls create/join/rejoin/start, both clients see 2/5, a former player can leave a server-released seat, and caret and buy-in behavior are checked.

Empty waiting tables are retired after the existing host return grace. Paid claims and occupied games are protected. Linked Discord voice channels are cleared before deleting their table rows. Finished results retain their existing review window.

## Poker session regression

[Before proof](poker-session-before.json) reproduces a zero-stack seat being released and a completed table accepting a fresh buy-in. [After proof](poker-session-after.json) checks two independent identities and two browser views: retained zero-stack seats, free return to the original paid seat, three exact-charge top-ups, rejection above the stack limit, identical replicated state, a resumed next hand, final cash-outs, and rejection of both buy-ins and top-ups on the ended session. The CPU case waits for the real 30-second takeover grace, verifies a mid-hand return preserves its original funding, and finishes a CPU-controlled host's winning hand. Room chips remain conserved.

The error-panel screenshots replay the actual server's rejected out-of-range top-up through the gameplay error presenter after closing the waiting overlay. They verify the reported header collision without modifying shipped source or fabricating a server response.

[Paused-disconnect proof](poker-session-disconnect.json) verifies that a zero-stack player who closes their last connection keeps the reconnect grace, then releases their seat and closes the unplayable session with all chips conserved. [Broader live economy checks](economy-live.txt) also cover paid game settlements, poker entry between hands, and Blackjack top-ups and entry.

## Validation and reproduction

[Client checks](client-tests.txt), [server checks](server-tests.txt), [Discord checks](discord-tests.txt), [type checks](typecheck.txt), [lint](lint.txt), and [build](build.txt) were run in the cloud workspace. Chromium desktop and touch emulation cover 1440×900, 844×390, and 667×375. Safari on an actual iPhone is not claimed.

The latest client suite passes 515 tests with one skipped. The earlier server and live economy regressions and 69 Discord checks also pass, with six optional live Discord checks skipped. Type checking, lint, and the production build pass.

Run the app on local port 5175 against an isolated `room-economy-test` module, with current generated bindings, then:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter discord-bot exec tsx ../scripts/lobby-ux-proof.ts
pnpm --filter discord-bot exec tsx ../scripts/seat-connection-proof.ts
pnpm --filter discord-bot exec tsx ../scripts/poker-session-proof.ts
pnpm --filter discord-bot exec tsx ../scripts/card-readability-proof.ts
pnpm --filter discord-bot exec tsx ../scripts/eight-player-screenshots.ts
POKER_SESSION_DISCONNECT_PROOF=1 pnpm --filter discord-bot exec tsx ../scripts/poker-session-proof.ts
node scripts/lobby-dialog-proof.mjs
```

The proof scripts reject hosted app targets or use a fixed loopback database. Test-only browser routes expose the current scene solely within the harness; the shipped app includes no debugging hook. No credentials appear in this evidence directory.
