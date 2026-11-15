# Classic Blackjack evidence

Blackjack uses a separate house dealer above a four-player side rail and the local player's personal band. Five players plus the dealer fit at the supported maximum. A spectator sees the fifth player in the personal band. Quiet names, prominent chip balances and readable public cards replace the former overlapping split-hand fans. Blackjack wagers against the house, so it does not display an entry-fee prize badge.

Each player can have four split hands. Their cards, exact total, individual bet and result use a bounded hand viewer; growing private and public hands have independent card pages. The personal band follows the active hand. Browsing an inactive split hand replaces decisions with a return-to-active-hand control. Hit, Stand, Double, Split, Surrender, Insurance, No thanks and Even money appear only when supported by the existing rules. Dealer card two and the dealer total remain hidden until settlement. All player cards are public under the Blackjack rules.

Captures use real server reducers and independent identities against `room-economy-test` on port 3000 and Vite on 5175. No cards or server state were injected. Candidate waiting tables were searched using the deterministic rules and the actual table seed, then the accepted deal was played through the server. Rejected waiting tables were removed without starting a hand. The browser harness preserves Vite's environment import while freezing HMR, limits rendering to 30 FPS, fronts the active page for input and closes every context and SDK client in `finally`.

The captured runs include desktop 1440×900 and touch Chromium 844×390 / 667×375:

- `split-01-*`, `split-03-*` and `split-04-five-player-spectator-*` are the initial wager, split browsing and maximum spectator previews. They are separate deals from the final settlement captures.
- `split-02-*`, `split-04-live-multiplayer-replica-*` and `split-05-*` are the final live four-split-hand run. Real touch decisions progressed the hand to settlement. Independent desktop and touch identities matched normalized authoritative state during play and after settlement. `run-split.log` retains those comparisons; `proof-split-browser.json` records their scope and the visually observed final hand.
- `insurance-02-*` shows the dealer Ace, hidden hole card and the natural player's three insurance choices. `insurance-03-*` shows the actual Even money result and revealed dealer. The same run placed paid insurance for another player, checked rule-derived chip settlement, compared independent browser identities, and exercised Help, Chat and Leave. `proof-insurance.json` has the assertions and empty error array.
- `proof-split.json` is an additional, separate SDK-only audit deal. It records exact four-hand cards, bets, results and chip balances, legal Hit/Double/Surrender/Stand decisions, rule-by-rule state comparisons and agreement across five independent SDK subscriptions. Its state is not the state pictured in the browser screenshots. `run.log` is this latest SDK audit's log.

The immediate settlement screenshots show `Reviewing the round` before the casino sweep assigns the next server deadline. The UI uses `Next round in …s` when `startsAt` is available. Top up invokes the existing scene-owned funded flow; it does not alter wagering rules. Fractional chips from odd-stake surrender/insurance remain visible.

Reproduce the complete browser flow, with at most two views open briefly for state comparisons:

```sh
BLACKJACK_REPLICAS=1 /workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-blackjack-proof.ts
```

`BLACKJACK_FAST=1` skips the already-reviewed initial wager/browse/spectator previews. `BLACKJACK_CASE=insurance` or `BLACKJACK_CASE=split` runs one case. The exact SDK-only split audit uses:

```sh
BLACKJACK_CASE=split BLACKJACK_SDK_ONLY=1 /workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/classic-blackjack-proof.ts
```

Focused verification passed 26 tests across Blackjack input/layout/classic layout and shared hand inspection, targeted ESLint and client typecheck. Physical Safari was unavailable; these phone captures use touch Chromium. Root performs final repository-wide checks after the other agents close their clients.
