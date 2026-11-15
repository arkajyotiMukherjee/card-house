# Main and side pots

Poker now exposes the same main/side-pot partition during betting and at settlement. Unequal all-ins were already paid separately at showdown; this revision makes those limits visible during play, avoids misleading temporary pots, and uses exact contested awards for payout animation.

## Rules

A live all-in contribution fixes a cap. Every player's contribution up to that cap funds the main pot; further matched contributions fund the next side pot, continuing at each higher live all-in cap. Folded contributions remain in the money but folded players are never eligible to win. A folded-only cutoff does not invent another side pot.

A uniquely highest contribution is not a one-player pot. It is kept separate as **Awaiting calls** while another funded player can match it, or **Uncalled** once no further matching action is possible. Unmatched excess returns to its original stack at settlement and is excluded from pot awards and winner flags. Ordinary unequal blinds or in-flight raises, without all-in caps, remain one ordinary pot.

A funded contender who can still match a locked cap remains eligible while their response is pending. A stack too short to reach that cap is not advertised as eligible above its entire remaining stack. Calling short creates that player's lower all-in cap and updates the partition. No new bet is permitted when only one non-folded contender still has chips; that player answers any outstanding call/fold, then automatic runout continues. Oklahoma's mandatory discards still occur.

Each settled pot is ranked among its own eligible contenders. A player can win the main pot and lose a side pot; different side pots can have different winning hands. Ties divide each pot independently. Whole-chip remainders go to tied winners clockwise after the button. An uncalled return is never an odd chip, a pot award, or an additional winning hand.

The shared `pokerPotBreakdown`, `pokerPotWinners` and `pokerPotAwards` helpers serve settlement and presentation. `state.pots` retains the current contested layers and the finished partition. No database schema or generated SDK shape changes are required: game state remains JSON.

## Table presentation

Normal pots keep the existing large total and short horizontal chip piles. A layered pot shows Main pot and up to two side-pot amounts directly in the public area, with separate small matching chip groups. A pending/uncalled contribution has its own explicitly different tile. The exact total remains below the row.

At an eight-player table there can be seven contested layers plus an unmatched return. The main pot stays visible while arrows browse bounded side-pot groups; the labels never shrink into a seven-column strip. Large amounts use two wider columns. Community cards move down twelve logical pixels in layered mode to retain a clear gap below the pot summary.

Tapping a pot opens a read-only view of eligible players, the exact amount, and its independent winner(s) after showdown. A fixed Winner marker has its own column so long names cannot wrap into another participant. The dialog blocks poker controls underneath, closes with Close or Escape, and does not reveal private cards. Final pot summaries use bounded names; the detail view provides participant information. Different pot winners are called **Different pot winners**, rather than incorrectly being described as a tied hand. Selecting a settled pot focuses its winning hand for review.

Payout flights use `pokerPotAwards`, rather than inferring awards from stack deltas that might also include an uncalled return. They sum to the contested pot. Server chip balances remain authoritative.

## Verification

`server/src/poker-side-pots.test.ts` verifies pending matching calls, ordinary blinds, folded money, a short funded responder, eight-player/seven-layer partitions, separate main/side winners, independent tied pots, odd chips, uncalled returns, conservation, and uncontested-bet rejection. Existing Hold'em/Omaha/Oklahoma, all-in reopening and pot-limit tests remain in `server/src/poker.test.ts`.

Client tests cover bounded pages, a fixed main pot, larger exact amount columns, board spacing, result wording and exact payout animation. The [running-app evidence](poker-side-pot-evidence/README.md) uses real multiplayer reducers and independent authenticated browser identities. It includes an unanswered all-in raise, a final call from the phone canvas, three pots, maximum eight-player layers, readable phone pages and eligibility, and per-pot results.

## References

- [PokerStars poker rules](https://www.pokerstars.com/poker/games/rules/): table stakes, all-ins and separate main/side pots.
- [Poker Tournament Directors Association rules](https://www.pokertda.com/view-poker-tda-rules/): independent awards and the button-relative odd-chip convention, plus existing betting/reopening principles described in [the all-in rules](poker-all-in-rules.md).
- [User-provided video reference](https://youtu.be/B69C3xAwyWU?si=7gG-4iYc9JT_lk3D). Video playback/metadata was unavailable through this environment; it is listed as the user's explainer, not claimed as reviewed footage.
