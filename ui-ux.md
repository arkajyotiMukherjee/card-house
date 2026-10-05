# ui-ux.md

## Visual Style

The whole experience lives inside a single Excalibur.js canvas with a fixed virtual resolution (for example 960×540) and integer scaling, so pixels stay crisp.

- Art style is consistent with the Pixel Tabletop Kit:
  - green felt tables,
  - pixel playing cards and chips,
  - simple, readable pixel font.
- No HTML overlays; all UI (menus, buttons, labels, overlays) is drawn in-canvas.
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
  - Game logo/title in big pixel font.
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
  - Center: Title, e.g. “Online Card Room”.
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
- On confirm, go back to Main Menu.

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
  - hovered card pops up a few pixels and scales slightly.
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
  - calculate integer scale factor to fit screen while preserving aspect ratio.
  - center the scaled canvas, with letterboxing where needed.
- Hitboxes and text layout all use logical coordinates; Excalibur’s camera scaling handles physical pixels.

This keeps interactions predictable and the pixel art crisp regardless of display size.
