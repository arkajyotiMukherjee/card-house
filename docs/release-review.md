# Card House release review

This release collects the approved lobby fixes, session and betting corrections, and classic-table UI for all nine catalog games. It is prepared for a merge to main; production deployment remains a separate user-triggered action.

## Fixes, screenshots and proof

| Change | Screenshot and proof index |
| --- | --- |
| Refill/name spacing, chips wording, mobile button bounds, centered Rankings, scrolling/crowns, removal of unexplained status dots | [Lobby fixes](lobby-ux-evidence/README.md#screenshots) |
| Centered Create Table, visible/moving input carets, automatic minimum buy-in, bounded validation errors | [Dialog screenshots and two-browser proof](lobby-ux-evidence/README.md#screenshots) |
| Durable host, accurate seated counts, safe Leave, reconnect/socket ownership and empty-table cleanup | [Connection before/after and cleanup proof](lobby-ux-evidence/README.md#connection-bug-and-cleanup-proof) |
| Finished/CPU-controlled poker rejoin, retained zero stacks, exact top-ups, synchronized clients and final cash-out | [Poker session regression](lobby-ux-evidence/README.md#poker-session-regression) |
| Readable nine-game visual hierarchy, fonts, centered cards, private-hand band, rectangular navigation and game-specific actions | [Design system](design-system.md), [remaining five-game review](classic-games-review.md) |
| Eight-player poker, winner-only showdown review, folded-hand privacy, dynamic status/actions and chip transfers | [Poker motion/results](classic-poker-evidence/motion-revision/README.md) |
| No-limit/pot-limit host choice, all-in reopening and edge cases | [No-limit proof](classic-poker-evidence/no-limit-revision/README.md), [rule matrix](poker-all-in-rules.md) |
| Exact additional-stack slider endpoint (395 remaining means 395), legible labels and matching chip denominations | [Contribution correction](classic-poker-evidence/contribution-revision/README.md) |
| Bounded horizontal pot-chip piles with shared betting-preview styling | [Chip stack evidence](classic-poker-evidence/wide-pot-stacks/README.md) |
| Live main/side pots, unequal all-ins, eligibility, uncalled returns and independent payouts | [Four/eight-player screenshots and proof](poker-side-pot-evidence/README.md) |
| Shared prominent entry-fee prize pool, without redundant player counts | [Prize badge evidence](prize-pool-evidence/README.md) |
| Bluff: maximum six players, rank declaration, claims, grown hands, challenge, Flush and privacy | [Bluff](classic-bluff-evidence/README.md) |
| President: maximum six players, combinations, strength order, finish order and privacy | [President](classic-president-evidence/README.md) |
| Go Fish: maximum six players, targeted asks, books, large hands, ties and privacy | [Go Fish](classic-go-fish-evidence/README.md) |
| Crazy Eights: maximum seven players, wild-eight suit chooser, drawn/paged hands and privacy | [Crazy Eights](classic-crazy-eights-evidence/README.md) |
| Rummy: maximum six players, deadwood, stock/discard, growing melds/layoff and public-card paging | [Rummy](classic-rummy-evidence/README.md) |
| Blackjack: five players plus dealer, four splits, totals/bets/results, insurance/even money and hidden dealer hole | [Blackjack](classic-blackjack-evidence/README.md) |
| Spades: partnerships, bids/nil, tricks/bags, scores, final match and spectators | [Spades](classic-spades-evidence/README.md) |
| Hearts: directional passing, cross-page selection, tricks/penalties, moon, final scores and spectators | [Hearts](classic-hearts-evidence/README.md) |

The linked evidence includes unretouched desktop, 844×390 touch and 667×375 touch screenshots plus reproducible scripts and machine-readable proof. Earlier layout experiments are explicitly labelled historical; use each game's latest revision. Generated concepts are design references, not runtime proof. Spades' long replay used a documented test-only Canvas2D fallback under software WebGL load; normal concurrent desktop/phone play and the fresh final spectator view were checked in WebGL. Physical iPhone Safari is not claimed.

## Final validation

- [Full test command](release-evidence/tests.txt): 574 client tests passed, one optional live test skipped; normal server suites passed; 69 bot tests passed, six live-only tests skipped.
- [Typecheck](release-evidence/typecheck.txt), [lint/formatting](release-evidence/lint.txt) and [production build](release-evidence/build.txt) passed.
- `git diff --check` passed. A parallel validation run had one five-second test timeout; the complete test command passed alone without changing code.
- All browser/SDK proof clients are closed. No production service was deployed or changed during validation.
