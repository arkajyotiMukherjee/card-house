# Remaining classic games review

The five remaining catalog games use the approved classic table family: quiet unboxed names, prominent cards and scores, a wide personal-hand band, rectangular controls and bounded game-specific public areas. Entry-fee games retain the shared gold prize badge; Blackjack keeps house wagers and a separate dealer.

| Game | Supported table | Main layout adaptation | Screenshots and proof |
| --- | --- | --- | --- |
| Crazy Eights | 7 players | Stock/discard, active suit, four-choice wild-eight picker and paged private hand | [Evidence](classic-crazy-eights-evidence/README.md) |
| Rummy | 6 players | Deadwood-first personal band, draw/discard center and owner-labelled meld browser with independent card paging | [Evidence](classic-rummy-evidence/README.md) |
| Blackjack | 5 players plus dealer | Hidden dealer hole card, public player hands, bounded split-hand review and readable house actions | [Evidence](classic-blackjack-evidence/README.md) |
| Spades | 4 players | Partner opposite the viewer, bids/tricks/team scores, public trick and bounded score detail | [Evidence](classic-spades-evidence/README.md) |
| Hearts | 4 players | Direction-correct passing, cross-page three-card selection, public trick and score/penalty detail | [Evidence](classic-hearts-evidence/README.md) |

Each evidence page distinguishes actual server-backed browser actions from unit-only edge cases. Captures include maximum-player, spectator, desktop and both landscape phone sizes. Remaining private hands stay hidden; Blackjack player hands follow its public-hand rules and its dealer hole stays hidden until settlement.

Shared integration uses one classic-game registry, suppresses the legacy seat/HUD/economy layers, routes public feedback to the game-owned status area, and keeps warning panels clear of private hands. Blackjack receives its existing funded top-up and next-deal deadline through a dedicated context.

No game rules, schema or generated bindings changed for this UI batch. No PR or production deployment was created.

## Verification

Combined repository checks passed:

- `pnpm test`: 574 client tests passed, one skipped; normal server rules/lifecycle checks passed; 69 Discord bot tests passed, six live-only checks skipped.
- `pnpm typecheck`, `pnpm lint` (including Prettier), `pnpm build`, and `git diff --check` passed.
- The first parallel check run hit a five-second test timeout while build/type/lint were also running. The complete test command then passed on its own without a code change.

All proof browsers and SDK clients closed after verification. Screenshots remain unretouched. Spades' long retained match used a **test-only Canvas2D fallback** to isolate software WebGL pressure in this shared machine; its concurrent desktop/phone play and fresh final spectator views were checked in WebGL. The shipped renderer is unchanged. Hearts completed a retained 572-move match with a natural moon and terminal player/spectator review. Each game’s evidence page records its exact coverage and any unit-only edge cases.
