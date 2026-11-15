# ui-ux.md

## Visual Style

The whole experience lives inside a single Excalibur.js canvas with a fixed virtual resolution (960×540). The canvas scales to fit inside the browser window, and `image-rendering: pixelated` keeps the pixels crisp. Bars around the frame use the saved background color. The default is the green felt `#145c38`.

- Art style is consistent with the Pixel Tabletop Kit:
  - green felt tables,
  - pixel playing cards and chips,
  - simple, readable pixel font.
- No HTML overlays; all UI (menus, buttons, labels, overlays) is drawn in-canvas. The exceptions are the text-field inputs that sit on a focused canvas box, and the phone shell (rotate panel and fullscreen button, see Phone & Tablet Shell).
- Color palette: warm, slightly retro casino:
  - greens for felt,
  - golds/whites for key text,
  - reds for important warnings and negative actions.

## Global Layout

Across all major screens there’s a consistent structure:

- **Top strip:** title + room info + lightweight status indicators.
- **Center:** primary content (menu, lobby table list, or game table).
- **Left/right:** supporting lists (tables list, players list).
- **Bottom:** primary action area when in a game (buttons, prompts, your hand).

Buttons are chunky pixel rectangles, with:

- idle state: flat with dark outline,
- hover: 1–2px brighter border and slight lightening,
- pressed: darker interior and 1px downward shift.

## Main Menu

### Layout

When the app loads (after assets), show the **Main Menu**:

- Background:
  - stylized top-down table edge with scattered cards/chips.
  - occasional slow, looping animation (a card sliding a few pixels, chip glint).
- Center:
  - Game logo/title “Card House” in big pixel font.
- Below title:
  - Vertical stack of large buttons:
    - “Create Room”
    - “Join Room”
    - “How to Play (All Games)”

At bottom-right, a tiny, unobtrusive “v0.x” version marker.

### Flows

**Create Room:**

1. Click “Create Room”.
2. Modal-style panel appears:
   - “Your Name” text input.
   - “Create” and “Cancel” buttons.
3. On “Create”:
   - Call backend to create a lobby.
   - Transition to Lobby View for that new lobby.

**Join Room:**

1. Click “Join Room”.
2. Panel appears:
   - “Your Name” text input,
   - “Room Code” text input (4–6 chars),
   - “Join” and “Cancel”.
3. On “Join”:
   - Call backend `joinLobby(code, clientId, name)`.
   - If success, go to Lobby View.
   - If error, show red error text in panel: “Room not found” or “Room closed”.

**How to Play (All Games):**

- Opens a full-screen overlay:
  - left: list of game names (Bluff, Poker, etc.),
  - right: description and high-level rules.
- Navigation by mouse or up/down keys.
- “Back” button returns to Main Menu.

## Lobby View (Room)

This is the “card room” with people and tables.

### Layout

- Background:
  - dimmer vignette around edges,
  - a large central table silhouette or multiple faint table shapes as ambience.
- **Top bar:**
  - Left: Room code, e.g. “Room: AB3D”.
  - Center: Title, e.g. “Card House”.
  - Right:
    - player count: “Players: 8 / 50”,
    - “Leave Room” button.
- **Left panel: Tables List**
  - Scrollable column of table entries.
  - Each entry shows:
    - Game icon (small graphic hint for game type),
    - Game name: “Bluff”, “Hold’em”, “Blackjack”,
    - Table label: “Table #1”, “Table #2”,
    - Status text:
      - “Waiting – 2/6”
      - “In Progress – 5/8”
    - Colored status dot:
      - green for waiting,
      - yellow for in progress and joinable,
      - red for full.
  - At top of panel:
    - “Create Table” button.
- **Right panel: Lobby Members**
  - Title: “Players in Room”.
  - Scrollable list of:
    - small colored avatar square (or circle),
    - player name in pixel font.
  - For members currently seated at a table:
    - small tag, e.g. “Bluff #2” or “Hold’em #1”.
  - The current user is highlighted slightly (e.g. brighter name color).
- **Center bottom: Info strip**
  - Rotating tips, e.g.:
    - “Tip: You can sit at any table that’s not full.”
    - “Tip: Create multiple tables of the same game.”

### Interactions

**Creating a Table:**

1. Click “Create Table”.
2. Pop-up panel overlays center:
   - Dropdown list (or scrollable icon row) of game types:
     - Bluff, President, Crazy Eights, Hold’em, Five-Card Draw, Blackjack, Hearts, Spades, Rummy, Go Fish.
   - Slider or plus/minus controls for `Max Players` (within each game’s allowed range).
   - Optional game options:
     - for poker: starting chip stack, blinds level.
   - Buttons: “Create”, “Cancel”.
3. On “Create”:
   - Backend creates new GameTable.
   - Auto-join: user gets a seat at that table.
   - Transition to Game View for that table.

**Joining a Table:**

1. Click a table entry in the list.
2. If it’s joinable:
   - Small panel:
     - “Join Bluff – Table #2?”
     - Player count (e.g. “3/6 players”),
     - Potential note: “Game is currently in progress; you’ll join next hand” (for poker).
     - “Join” / “Cancel”.
3. On “Join”:
   - Backend seats the player if space is available.
   - Client transitions to Game View bound to that `tableId`.
4. If full:
   - Show subtle message near bottom: “Table is full” in red, fades out after a second.

**Leaving Room:**

- Click “Leave Room”.
- Confirm dialog: “Leave the room? You’ll lose your seats at all tables.”
- Cancel stays in the room.
- On confirm, the module drops that player’s seats, spectator rows, speaking rows, and voice-presence rows, deletes their lobby membership, and leaves the room itself open. The client returns to the Main Menu. Chat history stays. Cancel stays in the room.
- Reloading is not leaving. A refresh marks the member disconnected (`connected` false, `lastSeenAt` updated) and, when this browser still has the room stored, opens the lobby again instead of the Main Menu. The same membership and seats remain. A room with no lobby or table activity for one hour is removed, including players who stayed connected and did nothing. That returns this client to the Main Menu. Chat, joins, leaves, name changes, table creates, game moves, and watches reset the hour.

## Game View (Per Table)

Game View is where the action happens: cards on a table, chips, and per-game UI.

### Shared Layout Concepts

- **Background:** table texture from the Pixel Tabletop Kit; oval/circular green felt in the center.
- **Bottom center:** your seat and your hand (cards fan).
- **Top and sides:** other player seats, arranged around the table.
- **Center:** per-game focal area:
  - central pile, tricks, or community cards.
  - pot, dealer hand, discard pile, etc.
- **Bottom right:** main action buttons.
- **Top right:** small status box and “How to Play” button.

### Player Seats

Each seat is a small bundle of UI:

- Name label in pixel font, e.g. “Sam”.
- Optional chip stack (for betting games) near the name.
- For some games (Hearts, Spades, Rummy, Go Fish):
  - a tiny points or score label below name.

Seating positions:

- Your seat locked at bottom center.
- Others arranged clockwise:
  - top center,
  - left middle,
  - right middle,
  - diagonals for larger tables.

Active player highlight:

- When it’s a player’s turn:
  - subtle glow around their seat,
  - pulsing border or small arrow pointing at their seat.

### Your Hand

- Cards from `CardAtlas` fanned at bottom.
- Each card:
  - full-color front face,
  - slight overlap with neighbors,
  - the card under the pointer eases up, and the next card on each side eases up less. The rest of the hand stays down.
- Selection:
  - click toggles selection.
  - selected cards get a brighter outline or drop shadow.
- For some games (e.g. Rummy):
  - sorting controls:
    - small arrows or buttons to sort by rank/suit.

### Other Players’ Hands

- Render back-of-card sprites only (from asset pack).
- Display card count near their seat:
  - tiny pixel font, e.g. “x5”.

## Central Table Area (Per Game)

The central area differs by game but follows consistent visual patterns.

### Poker (Hold’em / Five-Card Draw)

- **Community cards (Hold’em):**
  - row of up to 5 cards in center.
- **Pot:**
  - chip stack sprites in front of community cards.
  - numeric pot value in small pixel text below or above.
- **Player chip stacks:**
  - near each player name,
  - size or height visually hints at amount (plus numeric label).
- **Bet markers:**
  - if needed, a small chip or marker in front of a player’s seat showing their current bet this round.

### Bluff / Crazy Eights / Uno-like

- **Central pile:**
  - face-down or face-up pile of played cards.
- In Bluff:
  - top card might be face-down (unknown),
  - a little text: “Claim: 2 × Queens”.
- In Crazy Eights:
  - top discard face-up,
  - small text: “Suit in play: Hearts”.

### Hearts / Spades

- **Trick layout:**
  - when a trick is in progress:
    - each played card appears near the seat that played it, but close to center.
  - After trick completion:
    - trick cards slide towards winning player’s seat briefly, then vanish.

### Rummy / Go Fish

- **Meld/book display:**
  - near each player, show small “book” icons or mini-rows representing completed sets.
- **Draw/discard:**
  - deck face-down on one side of center.
  - discard pile face-up next to it.

## In-Game Controls & HUD

### Action Buttons (Bottom Right)

Context-sensitive buttons:

- Poker:
  - `Fold`, `Check`, `Call`, `Bet`, `Raise`.
- Bluff:
  - `Play Selected`, `Pass`, `Call Bluff`.
- Hearts:
  - `Pass`, `Play Selected`.
- Blackjack:
  - `Hit`, `Stand`, `Double`, `Split` (if applicable).

Behavior:

- Only buttons valid for the current state are enabled.
- Disabled buttons are drawn darker and non-interactive.
- A short text hint above the buttons:
  - “Your turn: choose a card to play.”
  - “Place your bet.”

### Status Box (Top Right)

Small panel displaying:

- Game name and table label:
  - “Bluff – Table #2”.
- Phase:
  - e.g. “Dealing”, “Betting”, “Showdown”, “Passing Cards”.
- Turn:
  - “Turn: Alice”.

Also includes:

- A small `?` button for “How to Play”.
- Optionally, a gear icon later for per-table settings/exit.

## “How to Play” Overlay (Per Game)

Accessible from the in-game `?` button.

Behavior:

1. Screen darkens slightly.
2. Centered pixel window slides in:
   - Game name at top (“How to Play Bluff”).
   - Scrollable text area with concise rules:
     - Objective
     - Setup
     - Turn structure
     - Special rules.
3. Navigation:
   - Scroll wheel / drag for more text.
   - “Close” button or Escape key to exit.

Content comes from a data definition, not hardcoded inside rendering logic, so rules can be updated without touching layout.

## Dealer Representation (Blackjack & Some Poker Modes)

In games requiring a dealer:

- Dealer appears as a **special seat**:
  - top center seat, labeled “Dealer” or “House”.
  - distinctive color frame (e.g. gold border instead of white).
- Dealer’s cards:
  - Blackjack:
    - first card face-up.
    - second card face-down (back of card) until reveal.
  - At reveal:
    - simple flip animation:
      - scale X shrinks then grows as face/back sprite swaps.
- Dealer is not tied to a LobbyMember; it’s purely game state driven.

## Join / Leave / Spectate Behavior

### Joining an Ongoing Game

If a table allows mid-game joins:

- When you click “Join”:
  - UI shows a short note if you join next round/hand:
    - “You’ll enter at the start of the next hand.”
- Until then:
  - you may either:
    - spectate (see the table but with no hand), or
    - be shown a “Waiting to join…” overlay with minimal info.

### Leaving a Table

- “Leave Table” button at top-left or bottom-left:
  - on click, confirm:
    - “Leave this table and return to the lobby?”
  - On confirm:
    - send leave-seat request to backend.
    - transition to Lobby View.

If a player disconnects suddenly:

- Their seat might show:
  - greyed-out name,
  - small “(reconnecting…)” label for a short grace period,
  - then they’re removed or marked as left according to rules.

## Micro-Interactions & Feedback

- Hover states for:
  - clickable cards (lift + small shadow),
  - buttons (border lightens).
- Transitions:
  - when entering/exiting Game View or Lobby View:
    - quick fade or slide (under 300ms, so it stays snappy).
- Error feedback:
  - illegal move:
    - short shake of relevant card or button,
    - 1-line red text: “You can’t play that card now.”
- Positive feedback:
  - winning a trick or pot:
    - chips or cards briefly fly to your seat,
    - small “You won the trick!” or “You won the pot!” popup.

## Responsive & Scaling Considerations

- Canvas runs at a fixed logical resolution (e.g. 960×540).
- On resize:
  - fit the whole 960×540 frame inside the visible area, preserving aspect ratio.
  - center the scaled canvas. A narrower window leaves bars on the top and bottom. A shorter window leaves them on the left and right. The bars use the saved background, green by default.
  - the frame is never cropped. Safe-area insets stay inside the fit.
- Hitboxes and text layout all use logical coordinates; Excalibur’s camera scaling handles physical pixels.

This keeps interactions predictable and the pixel art crisp regardless of display size.

## Phone & Tablet Shell

A phone or tablet is any device matching `(pointer: coarse) and (hover: none)`. A narrow desktop window does not match and keeps the desktop shell (no rotate panel).

- **Fit, not cover.** Every browser scales the whole 960×540 frame to fit inside the visible area (`visualViewport`), minus the safe-area insets for the notch and home indicator. Nothing is cropped. A narrower window leaves bars on the top and bottom. A shorter window leaves them on the left and right. Those bars use the saved background color, green (`#145c38`) until the player changes Theme.
- **Rotate panel.** In portrait the game is covered by a green and gold panel that reads “Rotate the phone to landscape” and has a fullscreen button.
- **Fullscreen button.** In landscape the game shows, with a small fullscreen button in the top-left corner (clear of the notch) until the browser is actually fullscreen.
  - Where `document.documentElement.requestFullscreen()` works, the button enters fullscreen and then calls `screen.orientation.lock('landscape')`. A refusal leaves the layout as it is.
  - iPhone Safari cannot fullscreen a page or a canvas. There the button does not fullscreen. If the phone is still upright the rotate panel stays, and a note explains: tap Share, then Add to Home Screen.
  - When the page runs as an installed app (`display-mode: standalone`), the button is hidden.
- **Touch targets.** Pixel buttons are about 28px tall. On a coarse pointer the hit area grows to at least 44px around the same face; the pixel font and art do not change. Where two targets are close, the extra area is split between them so they never overlap. A card tap selects and Play fires on `pointerup`, so neither needs a hover. The hover lift is cosmetic.
- **Keyboard.** Tapping a text field puts the finger on a real HTML input already placed over the canvas box, so iOS opens its keyboard. The input is 16px text (no iOS zoom) with a hidden caret. The canvas label is the text the player reads, and a gold block caret sits on the pixel-font insertion point for the name, the room code, and chat. When the keyboard is up the page lifts, using `visualViewport`, so the focused box stays above it.


## Room economy lobby

The default lobby has a personal wallet summary, table browser, and player leaderboard. Use the full safe viewport width. Rank by settled net winnings and display available and committed chips separately. Chat is initially closed and replaces its column only after a button press; new messages have an unread indicator. Table cards show the host, fee or stakes, and an independent start countdown. Keep these labels readable rather than shrinking them beneath the action buttons.

Numeric chip dialogs stay on the canvas, use native text inputs with numeric keyboards, and grow with the number of settings. Creation confirms stakes and seats the creator as host. Joining confirms a fee or chosen casino buy-in before reserving chips. Keep room balances in the lobby and the top-up dialog. During a hand, show the playing stack; between hands, offer Top up in the personal area. Completed paid games retain a participant snapshot so releasing seats never removes winner names.

The lobby ranking list scrolls with wheel, touch swipe, and a draggable scrollbar. Place a pixel crown before the name of a unique positive-profit leader, leaving initial or leading ties uncrowned. Fit and recenter dynamic button captions whenever their text changes. Keep at least 16 logical pixels between Refill chips and Name.

The approved [classic-table design system](design-system.md) supersedes the earlier Poker roster and central review-tray experiment. Poker (Oklahoma) is the first implemented checkpoint. Opponents sit around the wooden rail with compact card fans, smaller unboxed names, prominent stacks and quiet bet/blind/fold status. Their whole cluster stays clear of neighboring seats and the public center. A flat pot surface and short horizontal chip piles sit above the lower community board. Pot chips use the betting preview’s face artwork, with repeated denominations split into piles of at most four rather than tall towers. The bottom bar holds an unboxed local name/stack, personal cards, and a dynamic status/action area: waiting and the latest move, controls on the player's turn, discard instructions, or winner/countdown/top-up after the hand. There is no duplicated global message banner on the felt.

Oklahoma uses four private cards before the flop, three after the flop discard, and two after the turn discard. Discard steps explicitly ask for one card and hide irrelevant betting controls. Holding inspects; only a short tap discards. At showdown, each non-folded contender's two remaining cards reveal at that player's rail seat, at the personal hand's resting scale. An uncalled hand keeps hole cards private. Community cards remain readable at 1.65 scale.

Classic tables pair Bree Serif amounts and headings with smaller Chakra Petch supporting text. Cards and chip totals have priority; outlines identify controls instead of framing every label. Caption bounds are measured and centered. The existing pixel-art card/table themes remain. Menu/input typography and the layouts of other games stay as they are until their own approval checkpoint. See the design-system document for exact tokens, safe-area behavior, maximum seat counts, special game zones, and the required test/evidence checklist.

The phone Fullscreen control stays aligned with Leave and uses a centered four-corner icon. The classic header reserves its space inside the frame, so it does not also consume the legacy 60px outer margin. Refit when entering/leaving classic mode even when logical width is unchanged.

Create Table is centered on the viewport on desktop and phones. Table-name and chat fields draw the same caret at the native input's published insertion index, including keyboard and pointer movement. Increasing Minimum buy-in raises Your buy-in only if needed; manually entering a lower buy-in keeps the stakes dialog open with a wrapped inline error. Keep visible waiting-room actions adjacent, identify watchers separately from seated players, and let a viewer leave after their seat has already been released.

Poker's variation and phase share a readable status panel beside Help; the current actor is on the second line. The action/review zone also identifies the variation. Table errors use a bounded message band below the board, clear of Hands/Wins. A paid poker result shows Top up to continue or Waiting for top-up while a session is paused, a shared server countdown when funded players can continue, and Session ended when closed. Hide Top up and disable fresh admission on an ended poker table; Watch remains available.

### Bluff classic checkpoint

The user has authorized Bluff after the Poker review. The [design system](design-system.md#bluff-adoption-checkpoint) now defines its six-player classic composition: quiet rail names, exact card counts, compact backs, a public rank/claim/pile, and a wider hand zone with responsive paging only for larger hands. Play/Pass and the rank picker follow the turn; Challenge remains accessible outside the turn when allowed. The table name heads the view; the center owns claim/challenge feedback and compact bottom-right controls own actions/results, and remaining cards stay private at the end. Other games retain their current layout pending the next review. Evidence is under `docs/classic-bluff-evidence/`.


### President classic checkpoint

President is the next user-authorized game after Bluff. Its classic composition uses the same readable six-player rail and wide private-hand band. The public center shows the latest combination to beat, a low-to-high strength guide, and then the final order/titles/points. Play/Pass use a compact right-hand column; large three-player hands page at the shared readable card size. Remaining cards stay private. See [the President design contract](design-system.md#president-adoption-checkpoint) and `docs/classic-president-evidence/` for the running-app review. Pause before migrating another game.


### Shared prize-pool header

All seven entry-fee games use the approved rectangular gold trophy badge: PRIZE POOL above a larger exact chip amount, replacing header player-count text. The badge is shared by `GameScene`, including games awaiting full classic migration. Legacy phase status remains in the header center and its hand/win counter yields that space. Live retained funding and settled participants determine the pool; current seat count does not. See [the shared badge contract](design-system.md#shared-prize-pool-badge) and [screenshots/proof](prize-pool-evidence/README.md).


### Go Fish classic checkpoint

Go Fish is the next user-authorized full UI migration after President. The classic table keeps the latest ask/result and stock in the center, prioritizes book scores and readable cards over names, and uses held-rank selection followed by a target chooser and compact Ask confirmation. Books opens a bounded public collection, and finish uses that area for ranked scores and all tied leaders. The shared trophy prize badge remains in the header. Private draws and remaining hands stay private. See [the composition contract](design-system.md#go-fish-adoption-checkpoint); screenshots and independent multiplayer proof belong in `docs/classic-go-fish-evidence/`. Pause before migrating Crazy Eights.


### Poker main and side pots

Unequal all-ins display a readable Main pot and numbered Side pot tiles in the public center. The main pot stays visible while extra layers page, with wider columns for large exact values. Tap a pot for eligible-player details and its independent result. Awaiting calls/Uncalled contributions remain separate from contested pots; returns do not count as wins. Layered mode moves the board down 12 logical pixels. Details block actions/slider interaction. The shared rules handle each pot's eligibility, winners, odd chips and exact awards. See `docs/poker-side-pot-evidence/` and [the all-in matrix](poker-all-in-rules.md).
