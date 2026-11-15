# Poker main/side-pot evidence

The table now shows live main/side-pot amounts instead of one indistinguishable total. Three ordinary pot layers fit directly; maximum eight-player layers use bounded pages with the main pot fixed. Pending unmatched contributions are explicitly Awaiting calls or Uncalled, not winning pots. Tap a pot for its eligible players and independent winners.

## Running-app screenshots

These are unretouched captures of real local multiplayer games, driven through server reducers with independent identities.

| State | Evidence |
| --- | --- |
| An all-in raise still awaiting the last caller | [844×390 touch](4-pending-call-mobile.png) |
| Main 400, Side 1 300, Side 2 200 | [Desktop](4-pots-desktop.png), [844×390 touch](4-three-pots-mobile.png), [667×375 touch](4-pots-small-mobile.png) |
| Only the larger contributors can win Side 1 | [667×375 touch eligibility dialog](4-side-pot-eligibility-small-mobile.png) |
| Different main/side winners after showdown | [Desktop](4-per-pot-results-desktop.png), [small viewport](4-per-pot-results-small-viewport.png) |
| Eight all-in players, seven contested layers | [Desktop](8-pots-desktop.png), [844×390 touch](8-three-pots-mobile.png), [667×375 touch](8-pots-small-mobile.png) |
| All maximum layers reachable, Main always visible | [Page 1](8-pot-page-1-small-mobile.png), [Page 2](8-pot-page-2-small-mobile.png), [Page 3](8-pot-page-3-small-mobile.png), [Page 4 / uncalled excess](8-pot-page-4-small-mobile.png) |
| Maximum-table eligible players | [667×375 touch dialog](8-side-pot-eligibility-small-mobile.png) |
| Maximum-table independently paid results | [Desktop](8-per-pot-results-desktop.png), [small viewport](8-per-pot-results-small-viewport.png) |

The final small-viewport result captures resize the already-open desktop context immediately after showdown, before the shared ten-second next-deal timer expires. They verify the 667×375 composition; the live small-phone and dialog shots use Chromium touch emulation. Physical iPhone Safari is not available here.

## Proof

[The script](../../scripts/poker-side-pot-proof.ts) creates four- and eight-player paid no-limit Oklahoma tables, with independent authenticated SDK connections. One browser/context is active at a time. The four-player case leaves an unanswered all-in raise on the table, captures Awaiting calls, and makes the final real call through the phone canvas. Mandatory Oklahoma discards hold a stable all-in layout, then actual discard intents advance both rounds to showdown. Browser snapshots must equal the server-subscribed state before every screenshot. A later mobile context belongs to a different player, checking independent identity replication.

The run verifies:

- Exact live pot entries sum to the committed total, including separately pending/unmatched chips.
- Four-player main and two side pots are visible together.
- Eight-player main plus six side pots and uncalled excess are reachable without shrinking all labels into the chip area.
- Main remains visible on every page; pointer paging and Close work on the small touch viewport.
- Pot detail rows contain exactly the eligible players.
- All pot winners at showdown are ranked independently; returned excess is excluded from contested totals.
- Complete final stacks conserve all buy-ins.
- Finished caption widths fit around the wide-column threshold and at 8,000,000,000 chips; long detail names stay on one bounded row with a fixed Winner marker column.
- No browser runtime errors.

Machine-readable [proof.json](proof.json) contains the live partitions, measured text bounds, final per-pot winners and conserved totals. [run.log](run.log) contains the successful run.

Reproduce with local Vite on port 5175 and the local `room-economy-test` database on port 3000:

```sh
/workspace/bin/pnpm --filter discord-bot exec tsx ../scripts/poker-side-pot-proof.ts
```

`POKER_POT_PREVIEW=1` performs the four-player phone preview only. Engine inspection and HMR freeze are test-route injections; neither is part of the shipped app.

## Focused checks

- Existing `server/src/poker.test.ts`: passed, including Hold'em/Omaha/Oklahoma, pot-limit ceilings, short/cumulative all-ins, reopening, existing side pots, uncalled returns and conservation.
- New `server/src/poker-side-pots.test.ts`: passed, including transient callers, a short funded responder, folded chips, seven layers, different winning hands, independently tied pots/odd chips, uncalled excess and uncontested-bet rejection. Registered in the ordinary server test command.
- Client poker suites: 39 focused tests passed across pot presentation, table result wording, chip motion, driver input and layout.
- Client typecheck and focused ESLint: passed.
- Real multiplayer browser proof: passed with `errors: []`.

Only the local database was published, with `--delete-data=never` and an empty migration plan. There was no hosted deployment, PR, commit or push. Full workspace checks are run by the parent task after both agents finish.


## Combined final checks

After both agents closed their browser/SDK clients, the parent task verified the combined implementation:

- `pnpm test`: **551 client tests passed**, 1 opt-in live client test skipped; normal server suites (including new side-pot cases) passed; Discord bot 69 passed, 6 opt-in live tests skipped.
- `pnpm typecheck`: passed for client, server, bot and shared rules.
- `pnpm lint`: passed, including formatting.
- `pnpm build`: passed; Vite retains the existing large-bundle advisory.
- `git diff --check`: passed.

No PR, commit, push or production deployment was created.
