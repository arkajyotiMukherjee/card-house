# Card House classic-table design system

Status: approved visual direction. Poker, Bluff, President and Go Fish are the mature references. The user has explicitly authorized **all remaining catalog games in parallel, one agent per game**: Crazy Eights, Rummy, Blackjack, Spades and Hearts. This batch authorization supersedes the earlier one-game rollout checkpoints below. Keep game rules and privacy intact; review the complete batch with screenshots and multiplayer proof before any separately requested PR or deployment.

The approved [classic poker concept](poker-layout-concepts/A-classic-table.png) and [game-specific concept set](poker-layout-concepts/all-games/manifest.json) define the visual family. Concept images illustrate composition; the game rules and real client state determine legal controls, cards, scores, and chip amounts. Screenshots of the running implementation belong in [classic-poker-evidence](classic-poker-evidence/README.md).

## Visual principles

- Keep the felt table and seated card players as the main scene. Use the existing stepped wooden rail, green felt, ivory card faces, red patterned backs, and restrained warm-gold trim.
- Attach a compact fan, small unboxed name, prominent playing stack/card count, and quiet seat status to each seat. Avoid full-height rosters or containing panels around opponents.
- Reserve the full bottom band for the local player. Their name, relevant personal values, hand, turn prompt, and actions remain together.
- Separate the public game area from private hands. A pot, trick, stock/discard, or meld is table state, not an opponent seat.
- Give each fact one home: do not echo the central claim or rank in the header and personal controls. Use the reclaimed space for readable cards rather than filling it with repeated status text.
- Give every required value a stable place. Cards, labels, decorations, buttons, and transient messages must not overlap at rest.
- Use readable type and measured spacing. Do not solve crowding by reducing all text or cards until they are unreadable.
- The green page already contains the scene; do not draw an additional border around the entire table UI. Borders identify controls, not every piece of information. The approved prize-pool badge is the deliberate information exception: one warm-gold outline and trophy identify the award. Use flat tonal surfaces for the personal band and poker pot, with no nested name boxes.

## Runtime and shared components

The app remains a canvas game. Logical height is 540 and the central reference width is 960. `main.ts` contains the frame inside the visible viewport and safe-area insets. A wide landscape device may extend the viewport horizontally up to 1440 logical pixels; side anchors use those gutters, while the board stays centered.

| Component | Owner | Contract |
| --- | --- | --- |
| Palette, type, tonal surfaces, seat slots, header boxes | `client/src/classic-table-design.ts`, `classic-table-ui.ts` | Reuse these for the next game rather than copying renderer coordinates. |
| Entry-fee prize badge and funded amount | `client/src/prize-pool-badge.ts`, `prize-pool.ts` | One scene-owned trophy badge across all seven prize games; exact funded amount, no header player count. |
| Responsive private hands, bounded backs and compact actions | `client/src/classic-card-layout.ts` | Share hand capacity, centered positions, paging margins and rail fan bounds across card games; game-specific compositions may reserve different action widths. |
| Pixel card/chip/table assets | `boot-scene.ts` and the atlases | Keep image sources on nearest-neighbor filtering; honor each player's selected card and table theme. |
| Game-specific public area and seat information | The game UI/driver | Compose shared primitives around the actual subscribed rules state. |
| Frame, safe insets, extra-width anchors | `main.ts`, `table-viewport.ts` | Preserve full-frame containment and refit when entering/leaving classic mode, even if logical width is unchanged. |
| Touch, hover, and hand inspection | `hand-hover.ts`, `card-hit.ts`, `mobile-shell.ts` | Short tap selects/acts; hold/slide inspects; releasing outside or canceling clears inspection. |
| Text entry and chat | Existing native-field overlays | Preserve real input focus, keyboard positioning, insertion index, and selection accessibility inside inputs. |

Native text fields and the mobile fullscreen/orientation shell remain the only HTML exceptions. Do not add a second DOM game UI. Use the existing Chat/Help/Leave callbacks when drawing classic header controls. Hide the legacy actor **and its child graphics and hit targets** so old captions do not appear underneath the new header.

## Palette and typography

| Token | Value / use |
| --- | --- |
| Cream | `#fff2c4`, primary labels and card information |
| Warm gold | `#e8cc82`, quiet borders and decoration |
| Muted cream | `#d2c795`, secondary status |
| Secondary text | `#c4d3c2`, names and body information |
| Quiet text | `#a7bfae`, blinds, folded state, metadata |
| Accent | `#f3d98b`, turn instructions and winning chip totals |
| Surface green | `#0c3825`, pot surface |
| Quiet control border | `#66866e`, secondary navigation and top-up controls |
| Give-up red | `#712b24`, Leave/Fold and destructive actions |

Classic tables use **Press Start 2P** for display text at 24 logical pixels or larger, where measured width and height fit the allotted box. Smaller display text falls back to **Chakra Petch SemiBold**, which also remains the face for names, captions, metadata and compact controls. A long title or amount must fall back to the readable proportional face rather than shrinking pixel lettering below the display threshold. Header titles request 24px and use the same measured fallback. Both axes remain centered.

The approved [Walkable Casino](walkable-casino.md) uses pixel display lettering for marquee headings and Chakra Petch for names, controls, and balances. Keep room chat and wallet actions accessible from the floor. The table directory, leaderboard, and gameplay use rectangular controls. Small avatar portraits carry the floor identity through to a seated game without taking space from the cards.

Priority order is cards and legal decisions, chip totals/pot, current personal state, then names and metadata. Typical logical sizes: pot amount 32, own stack 28, opponent stack 22, result title 24, current instruction 20, names 17, seat status 16, nonessential metadata 14. Names stay unboxed and at least 16 when fitting a long name. Test full names, not just one-word placeholders. At a 667-pixel-wide landscape phone, the labels must still be readable.

The canvas has 2× backing resolution and smooth CSS scaling for text. Sprite sources keep pixel filtering. Do not change card texture filtering to blur the art when adopting readable text.

## Layout zones and responsive behavior

| Zone | Canonical position | Purpose |
| --- | --- | --- |
| Header | y=16, controls 40 high | Leave and Chat on the left; game/phase centered; prize-pool badge (or casino hand summary) and Help on the right. |
| Opponent rail | Above y=436 | Card fans, small plain names, larger stacks/counts, and a quiet status line. |
| Public play area | Approximately x=244–716, y=212–422 | Pot/trick/piles/melds and public cards; no persistent global message banner. Games may specialize inside this area. |
| Personal band | x=8–952, y=436–532 | One coherent band for the local player, extended into available side gutters. |
| Personal identity | Left of the band | Name and playing stack, card count, bid, deadwood, or score, as appropriate. |
| Personal hand | Middle of the band | Visible ranks and suits; hover/hold inspection may lift into the felt temporarily. |
| Personal state and controls | Right of the band | Waiting/action summary, live controls, discard instruction, stake entry, or result/countdown depending on local state. |

The classic header already reserves room for the phone Fullscreen control. Do not also add the old 60-CSS-pixel shell margin. Fullscreen must align vertically with Leave, have the same visible height, have a centered icon, and retain a sufficient touch target.

Use natural rail seating. For eight seated players: three opponents at the top, two on each side, and the local player below. Lower counts use fewer slots rather than empty name plates. A spectator at an eight-player table sees all eight opponents; the four top slots are slightly narrower, and there is no personal hand or betting action. Keep the public board centered as side gutters grow.

Plan bounds for the whole cluster, including revealed cards above the badge and status below it. Checking name rectangles alone misses the overlap that the earlier layout exposed. Use visible card-face bounds as well as sprite/hit bounds: each 64×64 sprite contains transparent padding.

Poker's pot amount sits on an unoutlined tonal surface to the left of a dedicated 280×100 chip area. Its unit caption is small and its numeric amount is prominent. Use the same face artwork, 1.6 scale and 4px layering as the betting preview. Decompose the pot into actual denominations and split repeated chips into balanced piles of at most four, spread horizontally across the chip area. Bound dense illustrations at nine piles while preserving smaller denomination groups. The community-card center is y=350, lower on the felt so chip stacks have more room. The numeric amount remains authoritative for large pots.

## Cards, interaction, and privacy

- Keep opponent backs in compact fans. The count is text; do not draw 30 expanding backs across neighboring players when a hand grows.
- Personal and public cards must have readable ranks and suits. Poker community cards use a 1.65 scale; personal cards and eligible Oklahoma showdown cards share the resting hand scale (1.1 desktop, 1.35 phone).
- Center the visible personal hand vertically in its band on both desktop and mobile. Poker compensates for the shared inspection helper's resting lift in its base card positions; preserve the lift, enlarged hit targets, and hold/hover inspection when doing this.
- Selection is communicated by a modest 12px lift at resting card size and an explicit action caption such as `Play 2`. Do not add yellow/red outlines to selected or discardable cards. Pointer hover/touch inspection alone enlarges a card. The focused card always draws above selected cards and easing neighbours, even immediately after switching focus. Selection height never affects draw priority. Equal inspection lifts and selected cards retain left-to-right hand order, with each right-hand card above its left neighbour so left rank/suit corners remain exposed. Stable collider targets do not move with this artwork.
- A large private hand uses an organized fan or horizontal browsing at readable size. Preserve rank corners and inspection; never shrink a 13-card hand into an opaque pile.
- Hidden information stays hidden. Bluff, President, Go Fish, Crazy Eights, Rummy, Hearts, and Spades do not expose remaining private cards just because the game ended. Public books, melds, and trick cards remain visible.
- Poker exposes only live contenders when betting is locked or at showdown. Folded cards and uncalled winners' hole cards remain private. Oklahoma reveals each contender's two retained cards at their own rail seat.
- Blackjack player hands are public by its rules; the dealer hole card remains hidden until scoring.

## Game-specific information

| Game | Supported players | Public center | Personal/status information |
| --- | --- | --- | --- |
| Poker | 8 | Board, pot/chips, latest action, winner | Playing stack, blinds/dealer, legal bet range, discard prompt for Oklahoma |
| Bluff | 6 | Face-down pile, called rank, latest claim | Card count, selected-card count; Play/Pass/Challenge |
| President | 6 | Combination to beat, rank order, finish order | Cards remaining, finish/pass status; Play/Pass |
| Go Fish | 6 | Stock and selected ask target/rank | Cards and books; Ask only for a held rank |
| Crazy Eights | 7 | Stock, discard, active suit | Card count; Play/Draw/Pass only when legal |
| Rummy | 6 | Stock/discard and a separate owner-labelled meld area | Deadwood and cards; Draw/Take/Meld/Discard according to step |
| Blackjack | 5 + dealer | Dealer, player wagers and public hands | Playing stack and up to four split hands with separate totals/bets |
| Spades | 4 | Trick, led suit, team scores/bids/tricks/bags | Partner, bid, up to 13 cards; bid or play according to step |
| Hearts | 4 | Trick, led suit, broken-hearts state, penalty points | Running score, passing direction, selected pass cards or legal play |

Non-casino games show an entry-fee **prize pool**, not poker betting controls or per-seat wagering stacks. Poker shows its actual pot; Blackjack has independent wagers against the house. Keep room wallet balances in the lobby and top-up dialog. A table only needs the player's playing stack or game score.

## Feedback and transient states

The right side of the personal bar is dynamic and sized for the actual action set. Show waiting/action text there when it adds information; do not repeat a public state already shown clearly in the center. Preserve full player names in action summaries. Show betting buttons only on the local player's betting turn; hide their graphics, captions, and hit targets at other times. A discard step shows a direct card-selection instruction. Stake entry replaces those controls. A result shows the winner/hand summary, shared countdown or pause state, and Top up when available. Spectators see state without player actions. `pokerPersonalMode` is the shared decision for content and control visibility.

Do not repeat a global winner/action banner on the felt. Keep only useful seat-specific bets, blinds, fold/all-in state, and showdown ranks beside opponents. An error temporarily replaces the personal status/control area and blocks clicks through its surface while visible; it must not cover community cards or the personal hand. Poker uses its wider action panel; Blackjack reserves 260px at x676 for its house-game decisions; the other games use the compact 184px action column at x752. Anchor warnings to the right gutter along with the controls so wider phones do not place them over hand cards.

Put the turn prompt above the user's actions with a visible gap. During Oklahoma discard steps, hide irrelevant betting actions and say exactly what is needed: tap one card to discard, four to three on the flop and three to two on the turn. Holding to inspect must not accidentally discard.

Show paid-session countdowns and paused/ended states from the shared server deadline. Offer Top up only when permitted. Returning to an existing paid seat must not charge another buy-in. These are rules/lifecycle contracts; changing the layout must preserve them.

## Validation and adoption gate

### Poker betting and countdown presentation

Controls use rectangular faces; do not cut or round their corners. Leave Table uses the same gold outline as the other brown actions. Tonal information surfaces may retain the small stepped corners.

Bet/Raise opens a thick, full-width canvas slider at the top of the personal control area. Below it, show the additional chips being paid now to the left of larger stacked chip previews, followed by explicit Confirm/Cancel actions. Use a bright, legible 17px block-font caption (“Add chips” for a raise or “Bet chips” for a bet). The value, slider endpoints and preview all use the contribution from the remaining stack, excluding earlier chips already posted on that street: 395 remaining plus a posted 5-chip blind displays 395, while the server still receives the correct 400 street total. Include the smaller denominations in the preview; 395 is three 100s, three 25s and two 10s. Keep the slider clear of the growing chips and place min/max endpoints beneath the rail. Drag/tap chooses a legal increment; desktop arrows fine-adjust and Home/End reach exact endpoints. Release, pointer cancellation, and window blur end a drag. Hidden legacy step controls have no graphics or hit targets.

Table stakes includes a host-selectable No limit/Pot limit control, independent of the card variation. The table header preserves that choice. Announce all-in calls/bets/raises in public action text and show the committed amount at live all-in seats. The legal slider endpoint remains server-rule-derived; short all-ins cannot silently reopen raising. See [the all-in decision matrix](poker-all-in-rules.md).

When a hand finishes, remove losing hands, including the local losing hand, and show a large central view of the winning showdown hole cards above the community board. Keep the rank caption and bottom-bar result/countdown legible. Split pots provide a Next control to review each winning hand. An uncalled winner's private cards remain hidden. A new hand restores the normal seat layout.

`poker-chip-motion.ts` observes accepted changes in committed chips and settlement balances. Bets travel from the contributing seat/personal chip preview to the center; payouts travel to the winning seat/stack. Draws, duplicate snapshots, initial subscriptions, and new deals do not replay payouts. Motion is cosmetic, bounded, and disabled for reduced-motion preferences; server balances remain authoritative. Destroying the driver removes flights and slider listeners.

Before calling a game complete:

1. Verify its supported maximum in the shared game definition. Include the local player in that count; exclude a house dealer and spectators.
2. Inspect full-name layouts at 1440×900 desktop, 844×390 touch, and 667×375 touch. Check safe areas, resize, and transitions into/out of classic mode.
3. Check real multi-user replication with independent identities, not a single-client static fixture. Compare server state across views after actual actions.
4. Exercise the densest game states: Oklahoma 4→3→2 cards and showdown; long Bluff/President hands; Rummy meld growth; 13-card Hearts/Spades hands; Blackjack splits.
5. Exercise input, not just screenshots: desktop click/hover, touch tap, long press, drag release/cancel, numeric controls, Chat, Help, Leave, and relevant disabled actions.
6. Verify public/private cards, winner text, all-in/paused states, and shared countdown behavior. A fold-only poker win must not reveal a private hand.
7. Run meaningful geometry/rules tests, type checks, lint, and the production build. Capture unretouched screenshots from the running app and link a proof summary. Generated concept boards are not test evidence.
8. Send the screenshots to the user and pause at the requested checkpoint. Record requested revisions before migrating the next game.

Reuse approved principles and primitives; do not blindly copy Poker's board, controls, or stack display into another game. A new game should describe its phases, public/private zones, required controls, and dense states before implementing its composition.

## Bluff adoption checkpoint

Bluff supports six players, including the local player. Use three top opponents and two side opponents at a full player table; a spectator sees six compact opponent groups. Apply the approved Poker typography, gold-outlined rectangular Leave control, quiet plain names, flat personal band, safe header, and shared card inspection. The pile is Bluff's public area; it is not a Poker pot.

- Header: table name only as the heading, with the shared prominent entry-fee prize badge. Keep the called rank and latest claim in the center; do not repeat them in the header or personal bar. Do not show a room-wallet balance or invented wagering stacks.
- Opponents: at most four compact backs per seat, exact cards-remaining text, a small name, and Passed/To play/Last play/Winner status. Large hands change the count rather than expanding across neighboring players.
- Center: called rank, owner-labelled latest claim, a bounded face-down pile, and exact pile count. Reserve “Flush” for a player who chooses to set aside the pile after everyone else passes. Center single-line states on both axes within the surface. A challenge reports its outcome and who picked up the pile. Keep at least 16 logical pixels of space between the claim text and visible played cards. Put rank/claim text on a quiet unoutlined surface so table ornament cannot merge with the letters. Only the local player's own last-play cards may be shown to that player, matching existing behavior. A leading player chooses among all thirteen ranks on a two-row, readable canvas picker in the otherwise empty center.
- Local hand: give the hand most of the personal band. The nine-card opening hand fits without paging on desktop and both tested phone sizes. Larger hands derive page capacity from device card size and available horizontal gutters, rather than a fixed small page. Reserve pager space only for paged hands. Keep stable ordering and selection across pages; update capacity on resize without shrinking cards or losing selections. Show a page indicator only while paging; the Play button owns the selected-card count. Hold/slide inspects; a tap selects by lift without a colored outline.
- Personal actions: keep a compact column at the far right, no more than 184 logical pixels wide. One action is centered; two stack vertically; three put Play/Pass side by side above Challenge. On the last player’s turn after everyone else passes, offer Play and Flush. Play keeps the rank and pile and reopens participation. Flush clears the pile and opens the rank picker. Challenge remains accessible outside the player’s turn while a claim is open. Do not repeat a claim or rank-selection instruction next to the controls. The active seat and central game state already communicate the turn.
- Challenges: preserve the existing hold, pickup, lift and settle animation. Show the unique challenge message in the public state surface, and defer the next lead's picker until the pickup settles.
- Results: show the full winner and prize in the personal bar. Keep remaining hands private; no Poker-style showdown reveal or winner-card focus is appropriate for Bluff. Preserve server settlement and safe exit.

Review at 1440×900, 844×390 touch and 667×375 touch. Include six players, a six-player spectator, ordinary nine-card opening hands, pickup-grown hands of at least 25 cards, cross-page selection, successful/failed challenge feedback, passed seats, and long winner names. Screenshots and multi-user proof belong in `docs/classic-bluff-evidence/`. Bluff has passed user review. President is now authorized; pause again after its screenshots before migrating another game.


## President adoption checkpoint

President supports three to six players. Reuse the six-seat rail, readable counts, compact backs, shared classic header and flat personal band. Header shows the table name and shared prominent entry-fee prize badge; it does not duplicate the central combination.

- Public play: show only `lastPlay.cards` while a combination is active, not historical trick cards. Center up to four separated cards at 1.4 scale below a quiet requirement/owner surface. Keep at least 16 logical pixels between card faces and both the requirement and low-to-high strength guide. Opening lead explains the required 3♣; a cleared trick says New lead.
- Rail: plain names, prominent exact counts and To play / finish position / final title. Cap backs at four even with an 18-card hand. No remaining private hand is exposed at game end.
- Personal hand: stable rank order from low 3 to high 2, shared responsive capacity and inspection, preserved selection across pages and resize. Give cards most of the bottom band. Play shows selection count; Pass is available against an active combination, with both controls in the compact right column. Empty Play is visually disabled; the server remains authoritative for combination legality.
- Results: replace the public combination with the full six-player finish order, titles and rule-derived points in two columns. Put the President and awarded prize in the personal status area. Remaining own cards stay inspectable and opponents remain private. No Poker showdown or betting UI.

Verify maximum six-player player/spectator views, three-player 17/18-card hands, both phone sizes, selection/paging/hold, public combinations, passing and cleared tricks, full finish order, settlement and navigation. Save running-app screenshots and replication proof to `docs/classic-president-evidence/`. President has completed user review. Go Fish is now authorized; pause again after its screenshots before migrating another game.


## Shared prize-pool badge

The user approved [this prize-pool concept](prize-pool-evidence/approved-concept.png) after the President review. It applies to **all entry-fee prize games** now: Bluff, President, Go Fish, Crazy Eights, Rummy, Spades and Hearts. This shared header improvement does not authorize the remaining games' full layout migrations.

- Replace the header player count with a deep-green rectangular badge, warm-gold outline and trophy, small gold PRIZE POOL caption, and a prominent ivory chip amount. Keep the exact amount on one line; fit larger values within the badge without truncation or wrapping.
- Badge center aligns with the navigation row. Canonical bounds are x672, y12, width220, height48, anchored to the right gutter and clear of Help. It is an informational surface without pointer handlers.
- `GameScene` owns one `PrizePoolBadge`, so every entry-fee game receives the same treatment, including spectators. Classic renderers keep the title and omit their former player-count/prize metadata. Older layouts retain their phase HUD in the free middle of the header; hide their lower-priority hand/win counter there to make room.
- During play, sum the actual retained `TableFunding.units`; a departing player does not remove committed entry fees from the prize. After settlement releases funding and seat rows, preserve the pool using the settled participants and the table's fixed entry fee. Hide the badge when entry fees are refunded or no prize has been funded. Result text remains in each game's existing result area.
- Poker uses an actual betting pot and Blackjack uses individual house wagers; neither receives an entry-fee prize badge.

Running-app screenshots at desktop and both phone sizes, seven-game coverage, large-amount fitting and proof are in [prize-pool-evidence](prize-pool-evidence/README.md).


## Go Fish adoption checkpoint

The user explicitly authorized Go Fish next, with a dedicated UI agent in parallel with poker side-pot work. Go Fish supports two to six players; two/three-player deals start with seven cards each and four/six-player deals with five. An ask targets another player and a rank held in the local hand. A successful ask or drawing the requested rank keeps the turn; four matching cards form a public book. The stock and latest ask/result are public; all remaining hands stay private at finish.

Reuse the classic rail, unboxed names, prominent card/book counts, bounded backs, full-width personal band, shared paging/inspection and gold trophy prize badge. The center owns the latest ask/result and stock. On the local turn, provide a readable held-rank/target chooser with a compact Ask action; avoid repeating the same instruction in the header and personal band. A compact Books action opens the bounded public collection: readable rank chips, separate fixed book scores, and measured/truncated names. Do not spread tiny repeated card art into other seats. Book scores take priority over supporting card counts; a truncated name must never erase a score. Selected ranks rest with a modest lift rather than persistent enlargement; hover/hold alone inspects, and collection mode suppresses inspection. At finish, show a readable books leaderboard, highlight every tied leader, and describe a shared prize rather than implying that each tied player receives the whole pool, without exposing remaining hands.

The Go Fish driver/layout/UI own this composition. `GameScene` recognizes `go_fish` as classic, hides legacy name plates/status HUD/counters, and routes transient feedback into the same classic error area. Keep the scene-owned prize badge. No Go Fish rules or stock-draw privacy changes are part of the visual migration.

Verify six-player player/spectator views, both phone sizes, asking/selection/hold, successful and missed asks, collecting books, long private hands and paging, final order/ties/prize, navigation and independent replication. Save unretouched screenshots and proof under `docs/classic-go-fish-evidence/`. Pause for user review before Crazy Eights or another game.


## Poker main and side pots

Unequal all-ins use the shared rule-derived live pot breakdown. Split only at locked live all-in caps; ordinary unequal blinds/bets do not invent side pots. Folded chips remain in the money but folded seats are never eligible. Separate unmatched leading chips from contested amounts while calls are pending, and return uncalled excess without treating it as a pot win.

The main table shows Main pot plus up to two side-pot tiles directly, with exact amounts and the same chip artwork as the personal preview. Larger exact amounts use wider columns rather than wrapped or tiny labels. At eight players, keep the main pot fixed while paging the remaining layers at a readable size; do not draw seven tiny stacks across the board. Show total committed chips and label pending contributions as Awaiting calls/Uncalled rather than a winning one-player side pot.

A pot tile opens bounded eligible-player details. At results, each pot names its own winner(s), and a tie splits that pot independently. Different main/side winners are not described as one tied hand. Keep winner markers and exact amounts in fixed space; only names may truncate. Selecting a settled pot focuses that pot's winning showdown hand. The normal board stays at y350; layered-pot mode moves it down 12 logical pixels to leave the pot overview clear. Detail mode blocks poker actions and slider keys until it closes.

Settlement and cosmetic chip transfers share exact contested-award calculation. Returned excess never inflates winner transfers. Validate unequal multi-all-ins, folded contributions, each pot's eligibility, odd chips after the button, unmatched returns, live pending calls, and the maximum seven contested layers. Rule references and decision matrix are in [poker-all-in-rules](poker-all-in-rules.md); running screenshots/proof belong in `docs/poker-side-pot-evidence/`.


## Remaining games: parallel adoption batch

The user authorized one subagent for each remaining game after reviewing Go Fish and poker side pots. Shared primitives and the gold trophy prize badge are stable; each game specializes its public area and personal actions rather than copying Poker's board or money model. `isClassicGame` recognizes all nine catalog games. `GameScene` owns frame/nav suppression, shared warnings and prize badges. Optional driver announcements have one game-owned status area. Stub/dummy tables retain the legacy fallback.

### Crazy Eights (maximum seven)

Public stock, enlarged discard and active suit/rank occupy the center. A selected wild eight opens a readable 2×2 suit chooser, replacing the piles while choosing. Keep selected cards at a modest resting lift and suppress inspection during the chooser. The compact dynamic action area shows Play/Draw/Pass according to the current state, and long hands use shared paging. Finish preserves private hands and shows the winner, points and prize clearly.

### Rummy (maximum six)

Own deadwood is primary; cards stay readable in the private band. The normal center explains draw/meld/discard once, with stock and visible top discard. A bounded owner-labelled meld viewer navigates growing public melds at readable card size, supports layoff selection, and suppresses underlying inspection/actions. Keep selection across hand pages. Finish ranks public deadwood results without turning over remaining private hands; public melds remain reviewable.

### Blackjack (maximum five plus dealer)

Blackjack is a house game, with no entry-fee prize badge. Keep the dealer distinct at top-center and opponents on side rails. Preserve dealer-hole secrecy until scoring; player hands are public by the rules. Up to four split hands per player use a bounded focus/detail view with exact hand index, bet, total and result, rather than expanding across neighboring players. Local focus hand and stack stay in the personal band. Reserve a 260px action area at x676 for readable multi-action controls; house top-up uses the existing funded between-hands flow through `RenderContext.houseGame.topUp`. Status, insurance/even-money, bets and results follow the server phase. Review max split growth and growing dealer/player hands.

### Spades (four players in partnerships)

Seat the partner opposite the viewer. Team scores, bids, tricks and bags take priority over names. Use a readable Nil–13 bid picker, then a separated owner-labelled public trick and led-suit/broken-spades state. Thirteen-card hands page at readable scale. A bounded Scores view shows both teams and last-hand changes; finish names the winning partnership and shared prize. Remaining hands never turn over at the end.

### Hearts (four players)

Passing directions must match physical relative seats. A three-card pass retains selections across pages with a modest lift. Center the public trick with owner labels and led-suit/hearts-broken status. Prioritize running scores and this hand's penalty points; bounded score/penalty detail handles public taken cards without crowding the rail. Explain moon scoring through public hand feedback and the final low-score board. Remaining private hands stay hidden.

The batch review and per-game evidence links are collected in [classic-games-review.md](classic-games-review.md). Each game needs maximum-player and spectator review at 1440×900, 844×390 touch and 667×375 touch, dense states, real input, privacy and independent multiplayer replication. Screenshots/proofs live in `docs/classic-<game>-evidence/`. Browser iterations use one view at a time and coordinated GPU slots; final checks run after clients close. Test-only HMR freezing must preserve Vite's leading environment import. Keep all runtime debug hooks out of shipped code.
