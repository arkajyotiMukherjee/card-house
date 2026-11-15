# Poker betting limits and all-ins

The table creator chooses **No limit** or **Pot limit** in Table stakes, independently of Hold’em, Omaha, or Oklahoma. Hold’em defaults to no-limit; Omaha/Oklahoma default to pot-limit. The choice persists across hands and is shown in the table header. Blinds and buy-in limits still apply.

No-limit means the player's whole playing stack is available on a legal betting turn, subject to raising rights. It does not allow out-of-turn actions, skipping Oklahoma discards, or betting against nobody. Room-wallet chips must first be bought into the table between hands.

## Decision matrix

| Situation | Behavior |
| --- | --- |
| Legal opening bet or full raise in no-limit | Slider shows the full remaining stack as the amount added now. Earlier chips posted on that street stay in the pot and count toward the server’s raise-to total. There is no pot multiplier cap. |
| Pot-limit selected | Maximum raise-to is the call followed by a pot-sized raise: current street bet + call + pot after calling, capped at the stack. All-in is available only when within that ceiling. |
| Stack is too small to call | Call commits the remaining chips; no debt or negative balance. The player remains eligible only for matched contributions. |
| Stack is below a normal minimum bet/raise | A short all-in is allowed on an otherwise legal betting turn. It does not reduce the last full raise increment. |
| Player already acted; a later short all-in raises the price | Call/fold remain available, but raising stays closed until the cumulative increase since that player's action reaches a full bet/raise. A prior check also counts as an action. |
| Several short all-ins cumulatively reach a full raise | Raising reopens for the affected player. Minimum raise uses the last full raise increment, not the last short increment. |
| Player has not acted yet | May make a legal full raise over a short all-in if another funded opponent can contest it. |
| One opponent is all-in, at least two other live players still have chips | The funded players may continue betting into side pots. The all-in player cannot win a pot above their matched contribution. |
| Only one live player still has chips | They answer any outstanding call or fold. No new bet/raise or empty side pot; no extra checks after calls settle. |
| A player already committed more than everyone can match | Unmatched excess returns at settlement and is excluded from the contested pot and winning-seat list. Matched excess against other funded players belongs to a side pot. |
| Big blind cannot post the full blind | The full big blind remains the opening price while two funded players can contest it. Preflop pot-limit ceilings assume full blinds, even when a blind posts short. Heads-up against the short blind, a covered player is not asked to add an uncontestable call. |
| All calls settled | Live contenders reveal; the board runs out automatically. Oklahoma still asks for flop/turn discards. Folded hands remain private. |
| Split main/side pots | Each pot is scored separately among its eligible players. Whole-chip remainder goes in seat order after the button. |
| Player's stack reaches zero after a hand | The saved seat remains. Top-up is allowed between hands within the table maximum and room balance. Play waits for at least two funded seats. |

All-in bets, raises and calls carry an explicit All-in event label to other players. Live all-in seats show their committed total prominently; the local personal bar shows the all-in/discard state. The header identifies the chosen limit, and the slider endpoint says All-in or Pot max as appropriate.

## Verification

`server/src/poker.test.ts` covers all three variations, host-selected limits surviving deals, full stacks above the pot, short/cumulative all-ins, checked/unacted raising rights, short blinds, side-pot eligibility, unmatched returns, conservation, ties, automatic runout and mandatory Oklahoma discards. Client event tests verify all-in announcements.

The [running-app evidence](classic-poker-evidence/no-limit-revision/README.md) includes eight-player pot-limit layout checks, two independent no-limit players, and actual desktop/mobile host-selector interactions. Touch checks use Chromium emulation; physical iPhone Safari is not available in this environment.

## Rule references

Reviewed November 15, 2026:

- [Poker Tournament Directors Association rules](https://www.pokertda.com/view-poker-tda-rules/), minimum raises and Rule 47 on reopening action after single/cumulative short all-ins. These betting principles also apply to our room cash-game flow; tournament-specific penalties are outside this implementation.
- [PokerStars poker rules](https://www.pokerstars.com/poker/games/rules/), table stakes, all-ins and separate main/side pots.

Oklahoma's required discards are this app's variation rule, retained while betting is locked.

## Visible main/side pots

The [side-pot contract](poker-side-pots.md) now covers live all-in caps, pending matching action, main/side-pot eligibility, bounded eight-player presentation, separate winner review, and exact contested payout motion. An unmatched contribution is shown as Awaiting calls or Uncalled, never as a one-player winning pot. Folded contributions remain in the funded amounts without creating artificial extra pots.
