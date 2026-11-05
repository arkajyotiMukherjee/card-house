// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

it('fits six phone actions with separate thumb targets below right-hand opponents', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: query === '(pointer: coarse) and (hover: none)',
      }) as MediaQueryList,
  );
  vi.resetModules();
  const {
    actionBox,
    insideCluster,
    seatFan,
    fanCardRect,
    fanLabelBox,
    opponentNameAnchor,
    rectsOverlap,
  } = await import('./table-presentation');
  const { seatAnchorsFor } = await import('./game-scene');
  const { STATUS_HUD } = await import('./status-hud');
  const { SOLO_PICKER, MENU_BUTTONS } = await import('./menu-layout');
  const { rankCallButtons } = await import('./bluff-layout');
  const { bidButtonBox, partnershipLinePosition } =
    await import('./spades-layout');
  const { askButtonBox, opponentBookOrigin, bookSlots, BOOK_ART_W } =
    await import('./go-fish-layout');
  const spadesOpponents = seatAnchorsFor(4).slice(1);
  for (let index = 0; index < 7; index += 1) {
    const line = partnershipLinePosition(index);
    const bounds = { x: line.x, y: line.y, w: 14 * line.size, h: line.size };
    for (const seat of spadesOpponents) {
      for (const card of seatFan(seat.x, seat.y, 13, 'Ada')) {
        expect(rectsOverlap(bounds, fanCardRect(card))).toBe(false);
      }
    }
    for (let bid = 0; bid <= 13; bid += 1) {
      expect(rectsOverlap(bounds, bidButtonBox(bid))).toBe(false);
    }
  }
  for (const count of [2, 3, 4, 5, 6]) {
    const opponents = seatAnchorsFor(count).slice(1);
    const asks = opponents.map((seat) => askButtonBox(seat.x, seat.y, 'Ada'));
    for (const ask of asks) {
      expect(ask.h * (390 / 540)).toBeGreaterThanOrEqual(44);
      for (const seat of opponents) {
        const origin = opponentBookOrigin(seat.x, seat.y, 1, 'Ada');
        for (const book of bookSlots(origin.x, origin.y, 1)) {
          expect(
            rectsOverlap(ask, {
              x: book.x - BOOK_ART_W / 2,
              y: book.y - 16,
              w: BOOK_ART_W,
              h: 32,
            }),
          ).toBe(false);
        }
        for (const card of seatFan(seat.x, seat.y, 13, 'Ada')) {
          expect(rectsOverlap(ask, fanCardRect(card))).toBe(false);
        }
      }
    }
    asks.forEach((ask, index) => {
      for (const other of asks.slice(index + 1)) {
        expect(rectsOverlap(ask, other)).toBe(false);
      }
    });
  }
  for (const box of [
    ...MENU_BUTTONS,
    ...rankCallButtons(),
    ...Array.from({ length: 14 }, (_, index) => bidButtonBox(index)),
  ]) {
    expect(box.h * (390 / 540)).toBeGreaterThanOrEqual(44);
    expect(box.y + box.h).toBeLessThanOrEqual(540);
  }
  expect(SOLO_PICKER.play.h).toBe(64);
  expect(SOLO_PICKER.play.y + SOLO_PICKER.play.h).toBeLessThanOrEqual(
    SOLO_PICKER.panel.y + SOLO_PICKER.panel.h,
  );
  expect(SOLO_PICKER.gameRow.y + 64).toBeLessThan(SOLO_PICKER.seatRow.y - 18);
  expect(SOLO_PICKER.seatRow.y + 64).toBeLessThan(
    SOLO_PICKER.variationRow.y - 18,
  );
  expect(SOLO_PICKER.variationRow.y + 64).toBeLessThan(
    SOLO_PICKER.nameField.y - 18,
  );
  const actions = Array.from({ length: 6 }, (_, index) => actionBox(index));
  expect(actions.every((box) => insideCluster(box) && box.h === 64)).toBe(true);
  expect(actions[5]!.y + actions[5]!.h).toBeLessThanOrEqual(540);
  expect(actions[0]!.h * (390 / 540)).toBeGreaterThanOrEqual(44);
  for (const count of [3, 4, 6, 8]) {
    for (const anchor of seatAnchorsFor(count).filter(
      (seat) => seat.edge === 'right',
    )) {
      expect(anchor.y).toBeLessThan(270);
      for (const card of seatFan(anchor.x, anchor.y, 27)) {
        const bounds = fanCardRect(card);
        expect(bounds.y + bounds.h).toBeLessThan(actions[0]!.y);
      }
    }
  }
  for (const count of [7, 8]) {
    for (const seat of seatAnchorsFor(count).filter(
      ({ edge }) => edge === 'top',
    )) {
      for (const size of [2, 7, 13, 27]) {
        for (const card of seatFan(seat.x, seat.y, size)) {
          expect(rectsOverlap(STATUS_HUD, fanCardRect(card))).toBe(false);
        }
      }
    }
    const [lower, upper] = seatAnchorsFor(count).filter(
      (seat) => seat.edge === 'right',
    );
    const name = 'MaxLength123';
    for (const size of [2, 7, 13, 27]) {
      const bounds = [lower!, upper!].map(({ x, y }) => [
        ...seatFan(x, y, size).map(fanCardRect),
        { ...opponentNameAnchor(x, y, name), ...fanLabelBox(name) },
      ]);
      for (const rect of bounds[0]!) {
        expect(rect.y + rect.h).toBeLessThan(actions[0]!.y);
        expect(bounds[1]!.some((other) => rectsOverlap(rect, other))).toBe(
          false,
        );
      }
    }
  }
});

it('separates mobile lobby chat and table targets and keeps two rows above paging', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: query === '(pointer: coarse) and (hover: none)',
      }) as MediaQueryList,
  );
  vi.resetModules();
  const {
    CHAT_PANEL,
    TABLE_LIST,
    LOBBY_PANEL,
    MOBILE_WATCH_BUTTON,
    LEAVE_ROOM,
    LEAVE_CONFIRM,
    listLayout,
  } = await import('./lobby');
  const { rectsOverlap } = await import('./table-presentation');
  expect(rectsOverlap(LEAVE_ROOM, TABLE_LIST.create)).toBe(false);
  expect(rectsOverlap(LEAVE_CONFIRM.leave, LEAVE_CONFIRM.cancel)).toBe(false);
  expect(rectsOverlap(CHAT_PANEL.panel, TABLE_LIST.panel)).toBe(false);
  expect(rectsOverlap(CHAT_PANEL.field, CHAT_PANEL.send)).toBe(false);
  expect(rectsOverlap(LOBBY_PANEL.saveButton, CHAT_PANEL.field)).toBe(false);
  for (const box of [
    CHAT_PANEL.field,
    CHAT_PANEL.send,
    LOBBY_PANEL.saveButton,
    MOBILE_WATCH_BUTTON,
    TABLE_LIST.create,
    LEAVE_ROOM,
    LEAVE_CONFIRM.leave,
    LEAVE_CONFIRM.cancel,
  ]) {
    expect((box.h * 390) / 540).toBeGreaterThanOrEqual(32);
  }
  expect(MOBILE_WATCH_BUTTON.h * (390 / 540)).toBeGreaterThanOrEqual(44);
  expect(MOBILE_WATCH_BUTTON.y + MOBILE_WATCH_BUTTON.h).toBeLessThan(
    TABLE_LIST.row.h,
  );
  const line = {
    id: 'one',
    gameType: 'bluff',
    gameName: 'Bluff',
    tableName: 'Bluff #1',
    currentSeats: 1,
    maxPlayers: 2,
    statusLabel: 'Waiting',
    seatsLabel: '1/2',
    seated: false,
    watching: false,
  };
  const layout = listLayout(
    [
      {
        gameType: 'bluff',
        gameName: 'Bluff',
        lines: [line, { ...line, id: 'two' }],
      },
    ],
    true,
  );
  expect(layout.hidden).toBe(0);
  for (const slot of layout.slots) {
    if (slot.kind === 'row')
      expect(slot.y + TABLE_LIST.row.h).toBeLessThanOrEqual(464);
  }
});
