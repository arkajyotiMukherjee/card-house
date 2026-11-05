# Mobile review in progress

No production deployment is authorized. This work must remain local until the owner approves it.

## Local environment

SpacetimeDB: `http://127.0.0.1:3100`, data directory `/tmp/cardhouse-mobile-local`.
Current database: `cardhouse-mobile-review`. The earlier anonymous database
`cardhouse-mobile-test` cannot be updated with the current identity.

From the repository root, update only the local module:

```sh
spacetime publish --server http://127.0.0.1:3100 --module-path server --no-config --yes cardhouse-mobile-review
```

From `client/`, run the isolated frontend:

```sh
SPACETIMEDB_HOST=http://127.0.0.1:3100 SPACETIMEDB_DB=cardhouse-mobile-review ./node_modules/.bin/vite --host 127.0.0.1 --port 5174
```

Chrome native app control works; the Chrome browser connector was unavailable.
DevTools device toolbar is set to Responsive, 844×390. Portrait mode showed the
rotation gate and landscape cleared it. A narrower desktop window is not a
substitute for coarse-pointer testing.

## Evidence so far

- Phone Bluff: created a solo game, inspected cards, selected and played cards,
  and observed the bot's next turn. A single tap selected two cards before the
  fixed-position hit-test change. Chrome touch emulation now confirms one tap
  selects one card and Play submits exactly one card. Center-based hit regions
  also prevent transparent sprite margins stealing the next card's tap.
- Phone rotation: portrait blocks play; returning to landscape restores the
  table, and tapping the first card selects that card. Double-tapping empty felt
  did not change the canvas size in Chrome touch emulation. Physical-device
  pinch behavior and Safari still need verification.
- Selected cards have a large gold outline aligned with magnified artwork.
  Inspection scale and the outline reset before a played card travels.
- Main menu, action buttons, Bluff ranks and Spades bids have larger mobile
  targets. Rank/bid grids use two rows above the hand. Action text uses the
  available button width instead of keeping the desktop's 8px type.
- Client verification: 61 files / 462 tests passed; client typecheck, targeted
  ESLint, and Vite build passed. Build retains a large-chunk warning (~911 kB).
- Phone President: created a three-player table. Opponent cards and the enlarged
  action area are separated. No complete browser match has been verified yet.
- Phone single-player picker: enlarged arrows change the game with one click;
  Play launches the selected game. Keyboard appearance still needs checking.
- Fullscreen control: no longer overlaps Leave Table in the 844×390 preview.
- Automated Bluff: 48 distinct complete bot games at 2, 3, 4, and 6 players pass.
  A cautious bot now passes without an honest card instead of endlessly recycling
  the pile through compulsory lies.
- Automated Spades: 24 distinct complete matches reach a winner at the score
  target. Replaced the former one-hand-only completion assertion. Bot bidding
  and trick play were adjusted; scoring rules were not changed.
- Existing rules suites for all nine games pass. These are evidence of covered
  rules, not proof of every variant or browser interaction.
- Waiting-player inspection now follows own-hand membership in all eight
  selectable-hand drivers, including Poker outside its discard phase.
  Regression tests exercise the waiting-player, opponent-card and blocked-input
  paths. Blackjack also has own-card inspection now.
- A short touch selects; a hold of at least 350ms or a slide over 10 CSS pixels
  only inspects. Chrome touch emulation confirmed sliding and holding in Bluff
  did not leave a selection after release. Cancellation has unit coverage.
- Own cards are 1.25× at rest on phones and up to 1.9× during inspection.
  They lift enough to remain inside the canvas; the player's name and totals
  were moved above the larger hand. Leave, Help and Chat have taller phone
  controls; the status HUD has larger text. Result banners also use larger type.
- Blackjack phone: bet 10 test chips, received 10C + 7H (17), stood against
  dealer 7S + JD (17), saw Push, Finished, one hand and zero wins. Reloaded in
  desktop mode and verified the same finished result and readable layout.
  This game's rules terminate after one hand; it has no next-hand intent.

- Phone Watch: one tap opened the waiting spectator table without a player seat.
  Leave Table returned to the lobby, and tapping Join then seated the player.
- Create Table now has a wide phone dialog with 64-logical-pixel selectors and
  larger labels. Browser checks confirmed switching from Bluff to Poker reveals
  its deal controls. Hidden deal buttons previously left their child captions
  visible; the whole controls now move offscreen together.
- Independent regular and incognito Chrome clients joined room `8BZM`, Bluff #1,
  as Mobile QA and Second QA. Both were dealt 27 cards. Second QA reloaded in
  coarse-pointer mode and rejoined its existing seat while Mobile QA retained
  the turn. Held-touch screenshots did not conclusively capture magnification;
  do not count waiting-player visual inspection as verified yet.

- Room-entry fields and Join/Create/Cancel now have 64px logical height on
  phones. Theme selectors and Close are also larger, with previews separated
  from labels. Chrome at 844×390 showed the full Join Room and Theme dialogs;
  one tap changed Light to Dark. The three affected test files pass (40 tests),
  and client typecheck passed. The original multiplayer tabs remain available.

- Crazy Eights: completed a full two-player solo round in phone touch emulation.
  Verified heart/suit matches, rank-based suit changes, repeated draws until a
  match, playing the drawn card, the bot naming suits with eights, and selecting
  a suit for the player's own eight. The original suit picker was small and
  overlapped the enlarged hand; it now uses 96×64 logical targets at y=300.
  A single tap on Club followed by Play submitted the chosen suit correctly.
  Eights QA emptied the hand and won 10 points; the database confirms the bot's
  only remaining card was 10H, winnerSeatIndex=0, scores 10/0, phase=finished.
  HUD showed Finished/Score 10 and lifetime Hands 1/Wins 1. Desktop reload
  preserved the result and displayed the same winner. This verifies the phone
  round and desktop result view, not a complete desktop round. The game has
  no next-round intent. Crazy Eights tests (13) and client typecheck passed.

### Latest overlay checks

- Phone Help now uses 14px logical text with narrower wrapping, 64px-high
  Previous/Next/Close controls, and a panel below the table header. Chrome
  844×390 touch emulation confirmed opening Help and tapping Next reaches the
  final Bluff instructions. Pagination advances one visible page and clamps
  to the last full page.
- Phone Table Chat uses a 64px-high input, Send and Close, 16px input text,
  and larger wrapped history. In local room 8BZM, one tap on Send submitted
  `Mobile touch check`, cleared the field, and displayed the message once;
  one tap on Close restored the unchanged table.
- Latest full client run: 61 files / 462 tests passed with `--maxWorkers=2`.
  The first unrestricted parallel run hit worker/transform timeouts; the
  bounded rerun passed. Server `npm test` passed (the optional live suites
  reported skipped). Client/server/shared typechecks passed. After the final
  overlay edits, the four affected client suites passed (48 tests), as did
  client typecheck, targeted ESLint, and diff whitespace checks.
- Chrome control resumed after the laptop was unlocked. Native clicks work;
  Chrome-extension screenshots work, but its mouse dispatch timed out.
  The regular Chrome tab remains the Mobile QA multiplayer Bluff table.

### Go Fish phone round completed

- Started a fresh two-player solo round as Fish QA in regular Chrome on
  `http://localhost:5174/`, using Responsive 844×390 touch emulation.
- Enlarged Ask from 56×22 to 96×64 logical pixels. Top-seat books now use a
  separate row at y=340, and last-request feedback sits above the local hand.
  Layout regression checks cover non-overlapping Ask controls, opponent fans,
  and single-book displays at every supported player count (2–6).
- Single taps selected matching ranks and submitted requests. Verified taking
  one or several matching cards, unsuccessful requests drawing a card,
  matching draws retaining the turn, switching ranks in a long hand, and books
  removing all four cards and incrementing the score. The hand reached 29 cards
  during this round; selected ranks remained visibly outlined.
- Fish QA scored books 3, K, 8, 7, 10, 6. Ada emptied and refilled its hand and
  scored 2, 9, A, Q, 4, J, 5. Local database confirms all 13 books / 52 cards,
  both hands and stock empty, phase=finished, turn=null, winnerSeatIndex=1.
  Browser showed Ada winning 7–6, lifetime Hands 1 / Wins 0.
- The result previously retained Ask and an ambiguous Books count. Finished
  games now remove Ask, name the winner and book count in the banner, retain
  each player's book count, and label the HUD count as Winning books.
  Reloaded the phone preview and verified the revised result: Ada wins - 7
  books, local Books 6, opponent Books 7, and no Ask control. The four affected
  test files pass (35 tests), along with typecheck, targeted lint and build.
  The production bundle remains about 912 kB with the existing size warning.
  This is a complete phone round; a full desktop round remains outstanding.

### Rummy phone round completed

- Played a full two-player solo round at 844×390 as Rummy QA. Drew from stock,
  selected and melded 8C/9C/10C, discarded cards, and laid off 5C onto the club
  run and 4H onto Ada's heart run. The bot also melded kings, played A/2/3 of
  hearts, laid off cards onto the shared melds, and went out by discarding 2S.
- A tap over overlapping meld cards originally sent multiple layoff intents:
  the first succeeded and the duplicates produced Invalid intent. Rummy now
  accepts only the frontmost non-hand card at the pointer location. A regression
  test dispatches the same tap to three overlapping meld cards and verifies
  exactly one intent. Browser verification after the fix successfully laid off
  4H with one tap, with the success message and no error.
- Server confirms phase=finished, winnerSeatIndex=1, Ada's hand empty and
  deadwood 0. Rummy QA holds 6S/AC/4S/3S/AS, totaling 15 deadwood. Lifetime
  stats show Hands 1 / Wins 0. The final screen now names the winner and
  deadwood, shows the local player's deadwood, and removes action buttons.
  Verified after reload: Ada wins - 0 deadwood, Your deadwood: 15, and no
  Stock/Take/Meld/Discard buttons.
- The four affected client suites pass (40 tests), as do client typecheck,
  targeted ESLint and production build (~913 kB, existing chunk warning).
  Taking from the discard pile, the stock-exhaustion ending, and a full desktop
  round still need browser coverage. This round verifies the empty-hand ending.

### President phone round completed

- Completed a three-player solo round as President QA at 844×390. Verified
  rejecting a lower rank, single-card selection/play, passing, a two clearing
  the trick and retaining the lead, selecting and playing three kings, and
  matching pairs. Both opponents passing returned the lead to the last player.
- Ada went out first. President QA played the final 6H over Bea's 5C and
  finished second. The local database confirms finishOrder [1,0,2], President
  Ada (3), Neutral President QA (2), Scum Bea (1), and Bea holding only 6S.
  Lifetime stats show Hands 1 / Wins 0.
- The finished ranking overlapped Leave Table. Mobile results now place the
  ranking centrally with larger text, omit the obsolete pile/strength strip,
  and remove Play/Pass. Waiting players now see New lead instead of Your lead.
- Enlarged the Single Player Play/Cancel labels to match their touch controls.
- Browser reload verified the full centered final ranking with no Play/Pass
  controls or obsolete pile, then returning to Single Player verified the
  larger Play/Cancel labels. The three affected suites pass (29 tests), along
  with client typecheck, targeted ESLint, build and whitespace checks. The
  bundle remains ~913 kB with the existing size warning.
- Full client suite passed: 61 files / 463 tests before these final presentation
  changes. A complete desktop President round and maximum-seat layout remain
  outstanding.

### Compact phone and touch-release regression

- Tested the Single Player picker and a four-player Spades game at 568×320.
  A single tap submitted bid 1; selecting and playing a club completed the
  first trick. Resizing the same live game back to 844×390 preserved the hand
  and selection alignment; following diamonds credited the partner's trick.
- Spades partnership scores were hidden behind the left opponent's fan.
  Mobile scores now use two columns above the bidding grid, with larger text;
  the spades-held/broken line sits below the grid. Decorative board chips are
  omitted on phones. Browser checks at both sizes show unobscured scores.
  Regression coverage checks every board line against all opponent fans and
  the 14 bid controls.
- Found a stuck-inspection regression after playing a card: neighbouring cards
  stayed enlarged after release. Excalibur can dispatch pointerenter after
  pointerup in the same frame. All nine card drivers now require a touch pointer
  to still be down before enter/move may inspect. Mouse hover remains enabled.
  Browser retest played 3H, leaving the remaining hand at rest, then held and
  released another card without leaving magnification or selection behind.
- Full client tests pass (61 files / 464 tests). The current Spades game is on
  hand 1, with three tricks complete; a full hand/match is not yet verified.
  At 568×320 the canvas buttons are smaller than 44 CSS pixels visually; the
  expanded hit areas help, but this is not a physical-device thumb test.

### Spades first phone hand completed

- Played all 13 tricks in the four-player phone game, including following suit,
  trumping while void, leading spades after they were broken, and returning
  the lead to the trick winner. Single touches selected and submitted cards;
  hands remained at rest after the release fix.
- Hand 1 bids were 1/4/1/1 by seat. The final totals were NS 6 tricks on a
  contract of 2, EW 7 on a contract of 5: scores 24/52 and bags 4/2.
  The browser showed these totals on the new deal, and the local database
  confirms handNumber 2, dealerSeatIndex 1, 13 cards per seat, reset tricks,
  bidding phase and spades unbroken. The player's sitting stats became Hands 1.
- The score event was quickly replaced by bot bidding. Added a client-side
  hand-result line retained throughout the next bidding phase, showing score
  deltas including penalties. It is based on consecutive subscribed hands;
  reloading during bidding retains the server's totals but not that explanation.
  Unit coverage passes; its live transition will be checked after hand 2.
- This verifies a full phone hand and the next deal, not the full 500-point
  match, nil bidding, bag penalties, or a desktop round.

### Spades second phone hand and result line verified

- Completed all 13 tricks of hand 2 without reloading. Verified following suit,
  void-suit trumping, overtrumping by a bot, and both partnerships taking tricks.
  Bids were 2/4/1/3; NS took 5 tricks on contract 3 (+32), EW took 8 on contract
  7 (+71). Hand 3 shows cumulative scores 56/123 and bags 6/3, with Hands 2.
- The live hand transition displays `Hand 2: NS +32 / EW +71` below the trump
  line, clear of bidding controls and the local hand. It remained visible after
  Cal's hand-3 bid and while waiting for the local bid. This completes the live
  verification of the new hand-result line. No reload was needed to see it.
- Full 500-point match completion remains covered by automated bot tests;
  browser verification here covers two complete hands and their new deals.

### Hearts first phone hand completed

- Started four-player Hearts at 844×390. Selected AH/AD/QC with three distinct
  gold outlines and passed left. Received 9H/8H/7H, then played all 13 tricks.
  Verified following clubs, spades, diamonds and hearts; discarding while void;
  hearts becoming broken; and captured hearts/queen of spades beside their owner.
- The game previously showed Pass and Play in every phase, including after a
  pass. It now exposes only the current seat's available action and ignores
  stale or wrong-phase action events. Verified Play during the local trick,
  no action while waiting, and only Pass at the next hand's passing phase.
- Off-suit selections were silently ignored. The action hint now names the
  required suit (browser-verified Follow hearts and Follow diamonds), with
  opening 2C and no-point-card guidance covered by the helper's rule checks.
- Hand 1 ended at scores 1/6/3/16 by seat, accounting for all 26 penalty points.
  Browser and database agree. Hand 2 has 13 cards each, handIndex 1, unbroken
  hearts, empty taken-card piles, and pass direction right. Sitting stats show
  Hands 1 / Wins 0.
- The transition revealed the last selected 6S stayed selected when redealt.
  Hearts and Spades now clear selection and inspection at a new hand or table.
  A regression test runs the render transition with the same card in both
  deals, verifies same-hand updates retain selection, and new hands clear it.
  Live new-hand verification of this fix remains pending; reloading alone
  does not prove that transition behavior.
- A full Hearts hand and next deal are verified; match completion, shooting
  the moon, and desktop interaction remain outside this browser pass.

### Hearts desktop hand and live selection reset verified

- Completed hand 2 at a 914×655 desktop viewport, including passing right and
  all 13 tricks. Mouse selection and the Play button each responded to one
  click; suit guidance changed between Follow spades, Follow diamonds,
  Follow hearts and Your play when void.
- Without a reload, the last play dealt hand 3 with 13 resting cards, no gold
  selection outline or retained inspection lift, and only Pass available.
  The prompt changed to Pass across and sitting stats to Hands 2 / Wins 0.
  Cumulative seat scores were 1/20/12/19 (52 total across two hands).
  The final 3D was not redealt locally; the same-card redeal case is covered
  by the render-transition regression test.
- Client verification after this browser pass: 62 files / 469 tests passed,
  TypeScript passed, production build passed with the existing large-chunk
  warning, and git diff whitespace checks passed.

### Poker desktop and phone hands

- Completed heads-up Hold'em hand 1 on desktop: called preflop, flop, turn,
  river; Ada's two pair beat the local high card, awarding the 280 pot.
  Showdown revealed hole cards, Hands 1 / Wins 0, and a ten-second next-hand
  countdown. Next hand rotated blinds and accepted actions normally.
- Switched hand 2 to 844×390 touch emulation and reloaded to activate the phone
  layout. Raise opened with one tap, increment moved 100 to 140 exactly once,
  and confirmation submitted a raise to 140. Checked flop, turn and river,
  then called Ada's river 40. Showdown awarded Ada the 360 pot, with stacks
  1320/680, Hands 2 / Wins 0 and the next-hand countdown.
- Fixed the amount selector's desktop-sized text on phone: the chosen amount
  now uses the larger button font, with a separate compact min–max range below.
  Visually verified before and after increasing the amount. Desktop retains
  its original two-line layout. Typecheck, targeted lint, and 22 Poker/button
  tests passed after this change.
- Poker's secondary chip/note/result text still needs a phone legibility pass;
  both hands were Hold'em, not Omaha or Oklahoma browser coverage.

### Poker phone text follow-up

- Enlarged Poker chip counts, blind marks, bet/turn hints, pot, winner and
  countdown from 8 to 12 logical pixels on phone. Updated centering and row
  spacing for the larger labels; desktop keeps size 8.
- Browser-verified two-seat phone preflop and folded-hand result with no overlap
  between text, cards and action buttons. Fold removed the action controls,
  awarded the 30 pot, and showed Hands 3 / Wins 0 and the countdown.
- Typecheck, targeted lint, and 22 tests across Poker, shared presentation and
  phone layout passed. Maximum-seat label placement still needs verification.
- Reopened the previous multiplayer browser identity; its current UI was the
  menu. Created fresh local room MLSQ for the remaining two-client Bluff check.

### Create Table tap interception fixed

- At 844×390, tapping the Create Table dialog's Create button focused the
  lobby Chat HTML input behind the canvas dialog and created no table.
  Native screenshots confirmed the tap was inside the visible button.
- The chat input now becomes inactive while `creating` is true; opening the
  dialog clears composer focus and refreshes HTML fields, and closing refreshes
  them again. Browser AX confirmed Chat disappeared while the dialog was open.
- Repeated the same two-seat Bluff setup in room MLSQ. One Create tap closed
  the dialog and added Bluff #1 (0/2 Waiting); Chat returned afterward.
  TypeScript passed. Independent-client inspection remains the next check.

### Two-client Bluff turns, reconnect and release

- In local room MLSQ, regular Chrome origins 127.0.0.1 and localhost provide
  independent client identities Mobile QA and Second QA. Both joined the same
  two-seat table and received 27 cards at 844×390 touch emulation.
- Holding Second QA's hand while Mobile QA had the turn left no selection or
  enlarged card after release. Native hold calls complete before the available
  screenshots, so this does not visually prove the mid-touch enlargement.
  The waiting-player inspection path is separately covered for all nine drivers
  by regression tests. Mid-touch visual confirmation remains outstanding.
- Mobile QA selected one KC and claimed Four; the other client saw one played
  card and received the turn. Second QA challenged, returning the false claim
  to Mobile QA. Second QA then played one KH as Ace; Mobile QA challenged and
  the card returned to Second QA. Both cases restored 27 cards to the liar.
- Both clients recovered the same room, hands and correct turn after development
  reloads. A single card tap, rank tap, Play tap and Challenge tap each worked.
- Fixed two observed overlaps: moved/enlarged the phone sitting hand counter
  past Chat, and moved challenge-arrival messages below the rank picker while
  a new rank is being chosen. Browser-verified the second challenge result fits
  between picker and local hand, clear of Play. Evidence screenshot:
  `/tmp/cardhouse-bluff-challenge-mobile.png`.
- Typecheck, targeted lint, 51 Bluff/inspection/hover/lobby tests, and whitespace
  checks passed. These turns do not establish full Bluff round completion.

### Mobile lobby columns and input controls verified

- Phone lobby now allocates a 328-logical-pixel table column, 392-pixel chat
  column, and 204-pixel player panel. Table titles, state, Join/Return, Watch,
  player names, chat messages and composer are larger; Save and chat controls
  have 64-pixel height. Desktop retains its layout.
- Chat messages wrap to the phone column width and show the latest available
  lines. Names longer than 13 characters are abbreviated in the player list;
  the rename field retains the full value.
- At 844×390, one Send tap posted a long local test message across multiple
  lines without entering the table column. One Save tap renamed Mobile QA to
  Mobile Touch and updated the player list. One Watch tap opened Bluff #1 as
  a spectator, with no personal hand or play controls.
- Screenshot `/tmp/cardhouse-mobile-lobby.png` captures the wider columns,
  wrapped message and name controls. Added geometry coverage for separate
  panels/targets, 44 CSS-pixel controls at this size, and two table rows above
  paging. Typecheck, lint and 47 lobby/phone-layout/HTML-field tests passed.
- Remaining observation: spectating the partially occupied Bluff table places
  the remaining player's name over its bottom fan. Spectator seat labels need
  a separate layout check; the Watch action itself works.

### Spectator bottom fan and mode label fixed

- The bottom opponent fan used the center-table band, overlapping its name and
  potentially Poker community cards. Spectators now use the otherwise empty
  personal-hand area for that fan, with 48-pixel cards and name/notes above it.
  Seated players' own hands and other opponent fans retain their sizes.
- Added a regression for seat counts 1–8 and hand sizes 1/2/4/13/27/54: bottom
  fan bounds remain within the canvas, below the board and clear of the full
  name/note block and right action area. Existing full-seat tests still pass.
- The enlarged phone Leave button hid the original Spectating label. Moved
  that label below the button and enlarged it to 12 logical pixels on phone.
- Browser-verified the local 27-card spectator view, visible Spectating label,
  separated name and fan, and no personal action controls. Screenshot:
  `/tmp/cardhouse-spectator-mobile.png`.
- Full client suite: 62 files / 471 tests passed. Client typecheck and targeted
  lint passed after these changes. Full goal acceptance is still pending.

### Leave Room, modal inputs and table paging

- Enlarged phone Leave Room and confirmation Leave/Cancel to 64 logical pixels,
  with larger dialog text. Moved Create Table below Leave Room so their hit
  targets remain separate. Desktop dimensions remain unchanged.
- Lobby-panel HTML fields now receive the room dialog's blocked state, covering
  both Create Table and Leave Room. Browser AX confirmed Your Name and Chat
  were absent while Leave Room was open and returned after Cancel. Cancel
  preserved membership, name and chat. Screenshot:
  `/tmp/cardhouse-leave-room-mobile.png`.
- Created local Bluff #2 and #3. Two rows fit on page one; Next page showed
  Bluff #3 on page two with a usable Watch target.
- The mixed-game header regression exposed insufficient height for a second
  group heading. Extended the list to y464 and moved the 64px paging button
  below it. Existing two-group coverage and phone target separation/size
  assertions now pass (25 tests); targeted lint passed. The dialog changes
  passed client typecheck before the final geometry-only adjustment.

### Rules-suite audit and mobile rejection feedback

- Ran the current server `npm test` command successfully. The rules checks
  covered all nine games, including Hearts moon scoring, Spades new hands,
  and Poker Hold'em/Omaha/Oklahoma and side pots. Bot and solo tests completed.
  Optional live integration tests reported skipped; they were not verified by
  this command.
- Moved phone lobby errors out of the paging control into the free bottom-left
  strip, using two wider lines. Lifetime stats hide while an error is displayed
  and return when it clears.
- Browser: attempting to join the existing in-progress Bluff table was rejected
  with “Game has started. Try another.” The message stayed fully visible below
  the inputs and clear of Next page. Screenshot:
  `/tmp/cardhouse-mobile-join-error.png`.

## Current acceptance coverage

| Requirement | Evidence and remaining work |
| --- | --- |
| Larger phone cards and clear selection | Implemented across drivers; phone selection and release checked in several games. Active held-touch magnification and return to rest captured in Bluff at 844×320 on November 3. |
| Inspection while waiting in multiplayer | All nine driver paths have regression coverage. Two-client Bluff turn transfer, challenge and reconnect verified. Active held-touch view and release captured while the phone client waited for Desktop QA in room 7D6X. |
| Thumb-sized controls and landscape layout | Chrome touch emulation covered the menu, lobby, Watch, chat, fullscreen and Bluff paging at 640×320, plus eight-seat Hold’em at 844×390. The revised mobile HUD clears the top fan in Chrome's iPhone 16 landscape preset. |
| No accidental browser zoom / aligned targets | Viewport, touch-action and gesture guards implemented with tests; rotation and double-tap checks recorded above. Physical-device pinch behavior has not been established by desktop emulation. |
| Single-player game playability | Completed phone rounds/hands of Blackjack, Crazy Eights, Go Fish, Rummy, President, Spades, Hearts and Poker. Bluff completed November 3; see the final-card challenge and winner evidence below. |
| Desktop playability | All nine games have complete round or hand-transition evidence. November 5 follow-up completed Go Fish, President, Spades, Bluff and Rummy through normal controls. The compact 27-card Bluff fan also accepted a play and returned to rest. |
| Installation | Chrome installed and launched the local app in standalone mode. iPhone 15 Pro simulator with iOS 17.4 completed Safari Add to Home Screen and rendered the standalone landscape menu with no browser toolbar or fullscreen shortcut. Physical-device installation has not been tested. |
| Rules, scoring and transitions | Server suite passes; browser outcomes and multi-hand transitions recorded per game above. Passing tests do not establish every rule permutation as perfect. |
| Local testing without deployment | Local Vite and SpacetimeDB environment running; no production deployment or Git push performed. |

## Outstanding acceptance work

- Check keyboard recovery and pinch behavior on iOS. The iOS 17.4 simulator
  verified the portrait gate, landscape safe-area layout, Add to Home Screen,
  and standalone launch. Native keyboard checks are blocked while the Mac is
  locked. Physical safe-area and gesture behavior remain unverified.
- Verify slide and cancellation on a device. Held-touch release is already
  captured in Chrome emulation while waiting in multiplayer Bluff.
- Finish rendered reduced-motion review (shared hand preference handling has
  regression coverage; this is an additional motion-preference check).
- Repeat final checks after any further implementation changes; the current client suite,
  typecheck, build, targeted lint and diff check pass as recorded below.

The goal is not complete. Preserve the scope above and report any unavailable
physical-device verification explicitly rather than claiming it was tested.

## November 3 — compact controls and touch lifecycle follow-up

User feedback supersedes the earlier blanket enlargement approach: mobile needs
contextual, separated actions and deliberate touch inspection, with desktop
behavior preserved. Lobby button captions are now 12 logical pixels and common
faces are 48 pixels high. Watch uses a 48-pixel face within its 64-pixel touch
region, placed on the right of the row, with bottom padding.

Chrome 844×390 touch emulation: created local room HV58 and Bluff #1, verified
Watch contained on the right, entered Spectating with one tap, and returned to
the lobby with one Leave Table tap. This verifies an empty waiting table;
active-game spectator layout is covered by the earlier evidence, not this check.

Card inspection now receives native pointer release/cancel and window blur even
outside card actors. Native pointer identity is used independently of Excalibur's
pointer index. Cancel/blur invalidate tap selection. Regression exercises an
unrelated pointer release, outside release, cancellation, blur, and easing back
to rest. 21 hover/inspection tests and TypeScript pass; 25 lobby/layout tests pass.
Browser evidence for active held inspection remains outstanding.

The local database was absent after restarting services and was recreated by
publishing only to 127.0.0.1:3100. Old rooms are unavailable in this new local
instance. No production publish or Git push occurred.

November 3 verification after the touch lifecycle and compact lobby changes:
all 62 client test files / 472 tests pass. Client TypeScript, targeted ESLint,
and Vite production build pass. The existing large-chunk warning remains
(917.49 kB minified bundle). Build output is local only. These checks do not
replace outstanding browser play and interaction acceptance checks.

November 3 solo Bluff phone follow-up: started a two-seat solo hand. A 900 ms
hold on 8C released to the resting hand without selecting; a subsequent short
tap selected exactly 8C with the gold enlarged frame. Chose Eight and Play;
the client showed one Eight played, transferred turn to Ada, and cleared the
selection. This establishes post-release and tap behavior, not a mid-touch
capture or complete round. The initial 27-card hand remains visually crowded;
mobile access to long hands needs interaction/layout work beyond enlargement.

November 3 sorted-hand browser verification: mobile prompt now sits below the
opponent count without overlap. Selected the end joker and played it as Eight;
Ada responded. Pass sequence cleared the Eights pile and Ada led Two. Two
adjacent taps selected 2D and 2H; Play submitted exactly two Twos and cleared
the selection. No stuck lift was visible after either play. The solo hand is
still in progress and is not recorded as a completed round.

November 3 touch-focused inspection: while a touch gesture is active, HandHover
now targets only the nearest card at full inspection lift. Adjacent cards ease
back rather than remaining magnified together. Mouse inspection retains its
three-card curve. Regression covers scrubbing between neighboring cards and
mouse behavior after touch cleanup. 24 hover/inspection/transition tests,
TypeScript and targeted lint pass. Rendered touch feel still needs checking.

November 3 contextual action check: browser reload restored the solo Bluff
session at a Three call with Ada holding 23 cards. Selected three cards and
verified the primary caption reads `Play 3`, centered within the existing face;
submitted the play. This does not establish the end-of-round result.

## November 3 — solo Bluff round completed

Completed the current two-player solo round in Chrome 844×390 touch emulation.
Earlier play covered 8C, a joker, a matching pair and a three-card play. Continued
with passes to exercise pile clears/new bot leads through Ada's last card. Ada
played the black joker as Ace; the game correctly retained a final challenge
opportunity with an empty bot hand, then the next Pass finished the game.
Browser shows `Winner seat 1 Ada`, HUD `Finished`, Hands 1 / Wins 0, no game
action buttons, and the local remaining hand at rest. All nine games now have
at least one completed phone-emulated round or hand recorded in this log.
This does not close remaining desktop, long-hand, small-screen, and active
held-touch visual checks.


November 3 reduced-motion review: shared hand inspection now honors the live
`prefers-reduced-motion` query. It preserves magnification and selection while
applying the inspection pose directly, avoiding the easing animation. Preference
changes affect existing hands. 25 hover/inspection/transition tests and client
TypeScript pass. Desktop browser checks paused because the Mac locked; user
unlock requested. This is not completion of the remaining acceptance work.

November 3 internal-browser desktop Blackjack: fresh solo game at 1280×720,
Desktop QA, Bet 10, 10S + JS = 20, Stand. Dealer JH + 3S + 2S + 6H = 21;
finished display shows `20 Lose`, Dealer 21, Hands 1 / Wins 0, and no hand
actions. Each action worked with one click. Cards, betting controls, and
result labels were readable and separated. Saved evidence:
`/tmp/cardhouse-blackjack-desktop-result.png`. Internal browser numeric IDs
changed during recovery; use the stable `iab` alias when rebinding tab 1.

November 3 desktop Crazy Eights started in the internal browser at 1280×720.
Opening discard 8C correctly permits any suit. Selected QH with one click,
Play moved only QH to the pile and set Hearts; Ada answered 2H and returned
the turn. Own cards, stock/discard, and action area remain separate and readable.
This is a partial desktop interaction check, not a completed desktop hand.
Saved `/tmp/cardhouse-crazy-eights-desktop.png`; internal tab 1 retained for continuation.

November 3 desktop Crazy Eights action availability: played 2C on 2H, Ada
replied 9C; played AC, Ada replied 10C. Browser captured Play/Draw absent
with `Wait` during both bot turns and present again with `Your turn` afterward.
Source now also ignores action input when waiting/spectating and prevents suit
naming outside the local turn. 17 driver/inspection tests and TypeScript pass.
Current desktop hand remains in progress with QD, 3D, 2D, QS and Ada at four.

November 3 verification after the Crazy Eights action availability change:
all 62 client test files / 476 tests pass. Client TypeScript, targeted ESLint,
diff whitespace checks, and Vite production build pass. The existing bundle
size warning remains (918.96 kB minified). Browser continuation is currently
blocked: the internal browser context tool reports `Local browser use is
disabled in Work settings`. User was asked to enable local browser use.
The browser skill file advertised in this session is also absent from its
installed path. No further visual or held-touch checks are claimed, and no
deployment occurred.

November 3 browser retry after the user enabled local browser use: two context
requests still returned the same disabled-setting error. Installed browser and
Chrome plugin `skills` directories are empty, so the advertised control skills
cannot be loaded. This is a tooling blocker, not a failed game check. No browser
actions or additional visual acceptance checks were performed in this retry.
The server `npm test` command also passed against the current worktree, covering
all nine game rule suites and bot/solo tests. Three optional live-integration
scripts reported skipped; this does not count as fresh live-database coverage.

## November 3 — browser access restored after Codex restart

Browser and native Chrome control work again. Restarted only the local database
and Vite services; the existing database and saved sessions survived. Completed
the desktop Crazy Eights hand at 1280×720: repeated draws, matching ranks/suits,
bot wild-eight naming, and final 5C play. Desktop QA won 11 points; HUD Finished,
Hands 1 / Wins 1, empty local hand and no action buttons. Saved
`/tmp/cardhouse-crazy-eights-desktop-result.png`.

Chrome Responsive at 844×320 keeps the menu, room forms, lobby and Bluff table
inside the screen. This is touch emulation, not a physical phone. The 23/27-card
hands remain crowded at rest. Native held input combined with a screenshot during
the press now captures the enlarged card above the finger; a later screenshot
shows the resting hand again. Evidence:
`/tmp/cardhouse-held-touch-844x320.png`,
`/tmp/cardhouse-released-touch-844x320.png`.

Created local room 7D6X, seated Desktop QA first and Mobile Touch second in
Bluff #1. With Desktop QA's turn still active, held a phone hand card and
captured its magnification above the finger. After release it returned to rest
without selection. This closes the previously missing active waiting-player
visual check. Evidence:
`/tmp/cardhouse-waiting-touch-844x320.png`,
`/tmp/cardhouse-waiting-release-844x320.png`.

Desktop Bluff exposed `Call a rank` overlapping the top opponent's count. Moved
the shared prompt baseline from 164 to 184 and removed the now-unnecessary
phone override. Browser shows name, count and prompt on separate lines;
selected AC, chose Ace and played once, transferring turn to Mobile Touch.
Saved `/tmp/cardhouse-bluff-desktop-prompt-spacing.png`. Targeted 43
Bluff/hover/inspection tests and client TypeScript pass. No production deployment
or Git push occurred. Remaining acceptance scope above is unchanged.

November 3 further desktop controls: Go Fish at 1280×720 selected aces and asked
Ada once. `Go fish` drew from the stock and transferred the turn; bot response
returned control. Own hand, stock, opponent name/count and Ask target remain
separate. Saved `/tmp/cardhouse-go-fish-desktop-controls.png`. This is an
interaction/readability check, not a second complete Go Fish round.

Desktop Rummy drew from stock and discarded 10H, then drew again and discarded
QS. Observed a UX issue: all four actions stayed visible at every step and during
bot turns. Controls now show Stock/Take only before drawing, Meld/Discard only
afterward, and no actions while waiting/spectating. Inactive-stage action input
is ignored; server rules still decide card/meld legality. Browser verified each
stage and turn transfer. Evidence: `/tmp/cardhouse-rummy-desktop-wait.png` and
`/tmp/cardhouse-rummy-desktop-context-actions.png`. Rummy's desktop hand is still
in progress; its completed phone hand remains the end-of-round evidence.

Compact phone follow-up at 640×320: Bluff table and actions fit. Rotating to
320×640 displayed the rotation gate; returning restored the table. One tap
selected only AH (`Play 1`), and one Play tap submitted that ace, cleared the
selection and transferred turn to Desktop QA. Saved
`/tmp/cardhouse-mobile-640x320-selection.png`. Restored Chrome to 844×390.
These observations do not establish safe-area/installed-app or physical pinch
behavior, and the long hand remains crowded at rest.

After these changes, all 62 client test files / 477 tests, client TypeScript,
targeted lint and local production build pass. Existing bundle warning remains
(919.59 kB minified). No deployment occurred.

## November 5 — crowded hands and desktop checks

Mobile Bluff hands above eight cards use pages with wider card spacing. Selections
persist across pages, and the Play caption counts the entire selection. The full
fan remains on desktop. In Chrome touch emulation at 844×390, a 27-card hand
showed four pages. Selected one card on each of two pages, saw `Play 2`, then
submitted both cards and observed the bot response. Saved
`/tmp/cardhouse-bluff-hand-pages.png`. The regression also covers a hand shrinking
to one page.

Desktop President accepted a six over a three. Play and Pass had remained visible
while waiting, so they now follow the current turn. Verified that both disappear
on a bot turn and return when control comes back. Saved
`/tmp/cardhouse-president-desktop-wait.png`.

Desktop Spades had scores crossing a side fan and bids covering the local name.
Moved the scores above the center and the desktop bid row onto the felt. Submitted
a bid of three, followed diamonds with 9D, and observed the partnership trick
count increase. Saved `/tmp/cardhouse-spades-desktop-bids.png`.

At 640×320 in Chrome touch emulation, Previous wrapped from the first Bluff page
to the last and Next wrapped back. Selected AS and a joker on separate pages,
submitted both with Play 2, and saw the hand shrink from four pages to three.
Saved `/tmp/cardhouse-bluff-640x320-paging.png`.

Created Bluff, President, and Crazy Eights tables in local room 2PF2 at the same
viewport. The first two fit above Next page. The next page showed Crazy Eights,
and its Watch button opened that table in spectator mode. Fullscreen removed
the fullscreen control and recentered the spectator table. Saved
`/tmp/cardhouse-lobby-640x320-page-2.png` and
`/tmp/cardhouse-compact-spectator-fullscreen.png`. Restored 844×390 afterward.

Installed-app and physical-device checks remain open. Everything remains local.

The local build now includes a web app manifest with standalone display,
landscape orientation, and 192px and 512px launcher icons based on the existing
Ace of Spades. Chrome DevTools read the manifest and both images, and Chrome
exposed Install Card House. The Vite build includes the manifest, icons, and
Apple touch icon link. Launch from an installed phone shortcut, safe-area
behavior on hardware, and real touch input still need device verification.

Chrome installed the localhost build and opened it in a dedicated app window.
The game rendered at 785×390 with Chrome's coarse-pointer emulation still
enabled. The browser reported standalone display mode and the game hid its
fullscreen button. Saved `/tmp/cardhouse-local-installed.png`. The local
test installation remains available in Chrome Apps. A phone home-screen
launch, real safe-area insets, and physical gestures remain unverified.

## November 5 — wider solo rules playtest

Ran twelve deterministic deals per seat-count configuration for President
(3 and 6), Go Fish (2 and 6), Crazy Eights (2 and 7), Rummy (2 and 6),
Blackjack (1 and 5), and Hearts (4). The six-seat Go Fish runs stalled after
the stock ran out. The other 120 deals completed with the prior strategies.

Go Fish bots now cycle through held ranks and opponents with cards, using a
per-seat ask count. Older table states start at zero. The bots use opponents'
hand lengths and their own ranks. All twelve formerly stalled deals now
finish with thirteen books, covered by the regression in `server/src/bots.test.ts`.
Server tests, typecheck, and targeted lint passed. Published the module to
`http://127.0.0.1:3100` for the local preview. This was a rules-level
simulation through the bot runner. The simulator Safari pass remains pending.

## November 5 — maximum-seat desktop layout

At 1280×720, a six-seat Go Fish solo table showed all five Ask controls and
separate opponent fans after the deal settled. Selected an eight and asked
Eli from the side seat. The event named Eli, the stock dealt a card, and
the turn moved to Ada. Saved `/tmp/cardhouse-go-fish-six-desktop.png`.

At eight-seat Hold'em, the pot amount crossed the chips. Moved it beside the
stack and verified the resulting flop layout at 1280×720 and 960×540. The Call
control submitted 40 after resizing, increasing the pot from 130 to 170.
Saved `/tmp/cardhouse-eight-seat-pot.png`. All 477 client tests, typecheck,
targeted lint, and the build passed. The Safari simulator pass still awaits
an unlocked desktop session. No live deployment.

Completed the eight-seat desktop Hold'em hand at 960×540. The river call
produced a 450-chip pot. Showdown named Eli as winner, showed the surviving
hands and their ranks, and displayed the next-hand countdown. Eli moved
from 860 to 1310 chips. The next deal reset the board and pot, rotated
the dealer and blinds, and showed Hands 1 / Wins 0 for the local seat.
Saved `/tmp/cardhouse-eight-seat-showdown.png`. No source changes in this pass.

A crowded-seat geometry sweep found that the two right-hand fans overlapped
on phones at seven and eight seats. Spread those two seats along a taller
section of the rail and sized each fan's spread to its share. The cards keep
their full size. The regression covers 2, 7, 13, and 27 cards per fan with
12-character names and checks clearance above the action controls. Visually
checked the eight-seat desktop table at 960×540. All 477 client tests,
typecheck, targeted lint, and the build passed. The revised phone layout
still needs a rendered max-seat check.

Confirmed the stock iPhone 15 Pro simulator is still booted under iOS 17.4.
This Mac has Xcode's Device Hub at
`/Applications/Xcode.app/Contents/Applications/DeviceHub.app`.
Use that app for the Safari UI pass. Chrome reached the local preview in a
fresh tab, but native DevTools input and Device Hub access timed out before
either could run the revised maximum-seat phone layout.

In the 1280×720 desktop solo Bluff opening, the rank picker covered the
local nameplate. Moved the desktop row and its hint above that plate.
Checked the full 27-card hand, selected Ace and AC, and submitted Play 1.
Ada became the active player with Ace as the round rank. Saved the selection
view at `/tmp/cardhouse-bluff-desktop-rank-and-hand.png`. Targeted Bluff
and phone layout tests passed. Device Hub access still timed out.

Continued the desktop Bluff game. Challenged Ada's claimed ace, saw Ada
receive both cards (26 to 28), and regained the rank call. The shared desktop
picker row now also keeps the Crazy Eights suit buttons clear of the local
nameplate. Crazy Eights offered Draw despite a legal heart match and returned
Invalid intent. The driver now hides and guards Draw in that situation using
the rule engine's existing hand check. Verified the hidden button at
1280×720 and played AH successfully. The targeted client tests and typecheck
passed. A rendered desktop suit selection remains to be checked.

Crazy Eights now shows Play when a matching card exists and Draw or Pass
when it does not. Play submits only a selected legal card, and an eight
requires a named suit. The driver regression covers both early Play
attempts and preserves the legal Draw and Pass paths.

Reopened the local Crazy Eights game in the desktop browser at 1280×720.
After QD and Ada's 7D, the player had 5C, 2S, and JH. Draw was the only
action shown. The first draw added 3S and kept the turn and Draw control.
The second added 4D and switched the available action to Play. Selected and
played 4D, which passed the turn to Ada. Saved the first draw at
`/tmp/cardhouse-crazy-eights-desktop-draw.png`. The full client and server
test commands passed. The server command skipped three optional live tests.

Verified the relocated Crazy Eights suit picker in the local desktop
browser at 1280×720. Selected 8D and confirmed all four suit choices sat
above the readable player name. Clicking Play before naming a suit left
the selection and turn intact. Chose Club, then Play. The table showed
Wild 8: Clubs and passed the turn to Ada. Saved
`/tmp/cardhouse-crazy-eights-desktop-suit.png`. No source changes.

Verified the revised eight-seat Hold'em layout in Chrome's 844×390 touch
emulation after reloading with emulation active. Both right-hand fans and
their nameplates were visibly separate, with room above the action grid.
A single Call tap committed 60 chips, increased the pot from 110 to 170,
and moved the turn to Ada. Saved `/tmp/cardhouse-eight-seat-mobile.png`.
The top-right opponent's fan touches the status panel at its lower edge
in this view. Safari and hardware verification remain open.

Raised the phone status panel by four logical pixels and reduced its height by eight. The three status lines keep their font size. All 28 targeted tests and typecheck passed, including seven- and eight-seat fan clearance through 27 cards. The fresh Chrome tab restored the game with desktop geometry in the responsive frame. The subsequent device-mode check stopped when the Mac ran out of disk space.

Chrome’s iPhone 16 preset at 852×393 in landscape restored the eight-seat Hold’em hand with the phone layout after a reload. The shortened HUD visibly clears Cal’s top-right cards, and all three status lines remain readable. Saved `/tmp/cardhouse-iphone-preset-table.png`. This is Chromium device emulation.

In Chrome iPhone 16 landscape emulation, sliding from AC onto the rank 5 button selected the rank on release. Bluff buttons now require the same pointer to press and release inside their actual hit area. Excalibur can route a queued down event using the final position for that frame, so the handler checks each event’s own coordinates. Repeated the slide and observed no selection or rank call. Then tapped Ace, AC and Play 1 individually and verified that Ada became active. Saved `/tmp/cardhouse-bluff-touch-slide-fixed.png` and `/tmp/cardhouse-bluff-touch-play-fixed.png`.

All nine table drivers now share the same press-and-release guard for their action buttons. The regression covers a queued press outside the button, a different pointer releasing, cancellation, and a valid tap. In iPhone 16 Chrome emulation, sliding a card onto Challenge left Ada’s claim in play. Tapping Challenge then returned two pile cards to Ada and reopened the rank call. Saved `/tmp/cardhouse-bluff-drag-challenge.png` and `/tmp/cardhouse-bluff-tap-challenge.png`. All 478 client tests, typecheck, targeted lint, and build passed. Browser retest after this refactor was limited to Bluff on emulated touch.

Applied the same press guard to Leave Table and the shared Help and Chat controls. In Chrome iPhone 16 emulation, releasing card slides on Leave Table and Help kept the Bluff game open. A deliberate Help tap opened the rules, Next paged, Close dismissed them, and a deliberate Leave Table tap returned to the menu. Shared-table Chat buttons were not exercised in this pass. All 478 client tests, typecheck, targeted lint and build passed.

Retested Table Chat in Chrome iPhone 16 landscape emulation in isolated local room QHKU. Watch entered the waiting Bluff table as a spectator. Sliding from the table onto Chat left it closed. A deliberate tap opened it, a test line appeared once after tapping Send, and Close restored the spectator view. Saved `/tmp/cardhouse-spectator-chat-send.png`. No source changes.

In room QHKU, a slide from Join to Watch originally opened spectator mode. Table rows now require a press and release in the same action region. In Chrome’s iPhone 16 landscape preset, slides in both directions left the player in the lobby. One Watch tap opened spectator mode, and one Join tap seated the player. The 26 targeted tests, typecheck, lint and diff check passed.

Applied the shared press guard to Rummy’s direct stock-pile shortcut. In Chrome iPhone 16 landscape emulation, a slide from the hand onto the face-down pile left the stock at 31. A deliberate tap drew one card, changed the stock to 30, and exposed Meld and Discard. Saved `/tmp/cardhouse-rummy-stock-tap.png`.

Checked Rummy at 667×375 in Chrome’s iPhone SE landscape preset. All eleven cards fit after a draw. A single tap lifted and outlined QD, and Discard put QD on the pile, reduced deadwood from 68 to 58, and passed the turn to Ada. Portrait showed the rotation gate. Returning to landscape restored the same hand and one Stock tap drew exactly one card. Saved `/tmp/cardhouse-rummy-se-selection.png` and `/tmp/cardhouse-rummy-se-stock.png`. No source changes.

With Chrome’s prefers-reduced-motion override enabled on the iPhone SE landscape preset, a long hold on AC released without selecting it, and a deliberate tap showed the enlarged card and gold selection outline. The screenshots captured the release and selection states. The mid-hold frame was not captured. The hand-hover regression verifies the reduced-motion path applies its target without easing. Restored the override to No emulation. Saved `/tmp/cardhouse-rummy-reduced-selection.png`. No source changes.

On the iPhone 15 Pro simulator running iOS 17.4, Safari loaded the loopback build in portrait and displayed the rotation gate. Rotating opened the landscape menu with the controls inside the screen cutout and home indicator. The fullscreen button showed the Safari installation instructions. Share → Add to Home Screen showed the expected name, icon, and loopback address, and added the icon. Opening the icon reached the standalone launch surface. The Mac had 116 MiB free and Device Hub could no longer capture images, so the rendered standalone menu and native keyboard interaction still need verification. Restored Device Hub keyboard capture to off.

The installed iOS 17.4 app rendered the landscape menu without Safari's address bar or the in-game fullscreen shortcut. All five menu buttons fit above the home indicator and outside the screen cutout. Device Hub screenshot failures prevented verifying the Join Room form and soft keyboard.

Fresh full client suite passed all 478 tests across 63 files with Vitest’s thread pool, runner config loader, and cache disabled. This avoided writing transformed modules to disk while the Mac was low on space.

Desktop continuation reached the reconnecting state. The loopback database stopped listening after a commit-log flush failed with ENOSPC. A restart using the existing local data directory failed with ENOSPC when acquiring the database lock. The Vite server is still listening. No database files were removed.

Restarted the loopback SpacetimeDB using the existing data directory after disk availability rose to 137 MiB. Desktop Crazy Eights restored the same turn and accepted 3C before passing to Ada. In a new desktop Go Fish round, Ask with no visible selected rank showed Invalid intent. Selecting 5D raised and outlined both fives, then Ask drew one card, reduced stock from 38 to 37, and passed to Ada. The desktop tab remains on the Go Fish round.

Go Fish now prompts Pick a rank before showing Ask. Ask is available only to the active seated player after a rank is selected. The client suite passed 479 tests, and typecheck, targeted lint, build, Go Fish rules, and server solo tests passed. The Go Fish rules test reached a finished state and checked winner and tie cases. Native Chrome and the in-app browser were unavailable for the visual retest.

Browser controls recovered after the app restart. Both localhost services were stopped, and the temporary database directory was empty. Restored the module to a fresh loopback database and started a new desktop Go Fish round. Verified Pick a rank before selection, matching-rank outlines and Ask after selection, and Ask disappearing on deselection. A request for threes took one card and retained the turn. Subsequent misses drew one card and hid Ask during Ada’s turn. Saved /tmp/cardhouse-go-fish-desktop-ask.png. The round remains open with stock 32.

Continued desktop Go Fish through twenty-card hands and Ada completing two books. Ask covered the top-seat book artwork. Moved desktop books below Ask and lowered the last-request caption to keep it clear of book ranks. Retested in the same round with two books and a successful queen transfer. All 13 targeted tests, typecheck, lint, formatting and diff check passed. Saved /tmp/cardhouse-go-fish-books-clear.png. The round remains open with stock 15.

Completed the desktop Go Fish round through stock exhaustion. Ada won with ten books, the local player retained three books, both hands cleared, Hands increased to one, and the HUD and banner agreed. Saved /tmp/cardhouse-go-fish-desktop-finished.png. Then completed a fresh three-seat desktop President round through the normal controls. Verified the required 3C opening, legal rank increases, passes and trick resets, a three-sixes lead, and continuation after Ada went out first. The final eight placed Desktop QA second. The result showed President Ada 3, Neutral Desktop QA 2, and Scum Bea 1, with Hands 1 and Wins 0. No source changes in this pass.

Completed a full desktop Spades hand through normal inputs at 1280×720. Bid three, followed suits, observed Must follow suit on an attempted spade while still holding KC, won with JC and AH, and legally trumped a diamond when void. NS bid seven and took eight, scoring +71 with one bag. EW bid six and took five, scoring -60. The next thirteen-card hand dealt automatically, trick counts reset, the previous score line remained visible, and Hands increased to one. Saved /tmp/cardhouse-spades-desktop-hand-score.png. Desktop Bluff and Rummy full-round checks and native iOS input checks remain open. No source changes.

Completed desktop Bluff at 1280×720 through normal controls. Played three aces
(including a joker), then passed Ada's successive claims. Ada's final card left
the table in Play with Challenge available and her count at zero. Passing that
claim finished the round with Winner seat 1 Ada, Hands 1, and Wins 0. Saved
`/tmp/cardhouse-bluff-desktop-final-response.png` and
`/tmp/cardhouse-bluff-desktop-finished.png`. No source changes.

Completed desktop Rummy at 1280×720 through normal controls. Took the discard to
meld three tens, laid off 4S onto Ada's fours, extended her Q-K-A heart run with
JH, melded 5H-6H-7H, and laid off 2H onto the twos. Selection cleared after
each move. Ada laid off 8H and discarded her last card; the result showed Ada
wins with zero deadwood, local deadwood one, Hands 1, and Wins 0. Saved
`/tmp/cardhouse-rummy-desktop-finished.png`. Desktop round or hand-transition
coverage is now complete for all nine games. Native iOS keyboard and physical
pinch verification remain open. All 479 client tests, client typecheck,
whitespace check, and Rummy rules tests passed. No source changes in this pass.

At 844×390 in the internal browser's desktop input mode, started a fresh
27-card Bluff hand. Selected the final joker, chose Ace, and submitted Play 1.
Ada responded with one Ace; the local hand had 26 cards at rest with no retained
selection. Saved `/tmp/cardhouse-bluff-compact-desktop.png` and restored the
default viewport. This is desktop input, not touch emulation. The fresh
production build passed with the existing bundle-size warning. Native iOS
testing could not resume because the Mac was locked; an unlock request is
pending. All work remains local and nothing was pushed or deployed.

After the user unlocked the Mac, Device Hub started the iPhone 15 Pro iOS 17.4
simulator. Created a separate Device Hub window because another simulator was
being used by another project. The test simulator reached its home screen and
accepted the Safari action, but subsequent native accessibility and screenshot
requests repeatedly failed with a computer-use service startup error. Host load
was above 700. Both loopback services remained listening. This attempt does not
verify keyboard appearance, keyboard dismissal, or pinch behavior. The remaining
native checks need a working computer-use service; unlocking is no longer the
observed blocker.

On resuming after the pause, both loopback listeners were stopped. Restarted
SpacetimeDB with the existing local data directory and Vite at 127.0.0.1:5174.
Verified both listeners and accepted database subscriptions. Safari on the
iOS 17.4 simulator rendered the portrait gate and, after Rotate Left, the
landscape menu outside the cutout and home indicator. Native input then failed
with `noWindowsAvailable`, including an accessibility-element click, despite
Device Hub returning its window tree. Keyboard and pinch checks remain open;
the landscape rendering does not establish their behavior. No deployment.
