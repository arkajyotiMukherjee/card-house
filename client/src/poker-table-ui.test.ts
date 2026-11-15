import { describe, expect, it } from 'vitest';
import {
  pokerSeatPanels,
  showdownSeats,
  POKER_CENTER,
  pokerPanelCopy,
} from './poker-table-ui';
import {
  POKER_USER_Y,
  pokerActionBox,
  pokerPersonalMode,
} from './poker-layout';
import { rectsOverlap } from './table-presentation';
import type { PokerState } from '../../src/shared/games/poker';

const seats = Array.from({ length: 8 }, (_, seatIndex) => ({
  seatIndex,
  name: `Player ${seatIndex}`,
  self: seatIndex === 0,
  x: 0,
  y: 0,
}));
function result(): PokerState {
  return {
    phase: 'finished',
    variation: 'oklahoma',
    street: 'river',
    handNumber: 1,
    deck: [],
    board: ['AS', 'KS', 'QS', 'JS', '10S'],
    dealerSeatIndex: 0,
    turnSeatIndex: null,
    currentBet: 0,
    minRaise: 20,
    pot: 160,
    pots: [],
    end: 'showdown',
    order: seats.map((seat) => seat.seatIndex),
    winnerSeatIndexes: [4],
    hands: { '4': { cards: [], name: 'two pair', score: [] } },
    step: 'bet',
    smallBlind: 10,
    bigBlind: 20,
    limit: 'pot-limit',
    seats: Object.fromEntries(
      seats.map((seat) => [
        String(seat.seatIndex),
        {
          chips: 400,
          hole: ['AS', 'KH', 'QC', 'JD'],
          streetBet: 0,
          committed: 0,
          folded: [1, 6].includes(seat.seatIndex),
          allIn: false,
          acted: true,
          mustDiscard: false,
        },
      ]),
    ),
  };
}
describe('poker information layout', () => {
  it('replaces waiting content with controls only for the player who can act', () => {
    const state = result();
    state.phase = 'play';
    state.turnSeatIndex = 0;
    expect(pokerPersonalMode(state, 0)).toBe('acting');
    expect(pokerPersonalMode(state, 0, true)).toBe('stake');
    expect(pokerPersonalMode(state, 2)).toBe('waiting');
    expect(pokerPersonalMode(state, 1)).toBe('waiting');
    expect(pokerPersonalMode(state, null)).toBe('watching');
    state.seats['0'].allIn = true;
    expect(pokerPersonalMode(state, 0)).toBe('waiting');
    state.step = 'discard';
    state.seats['0'].mustDiscard = true;
    expect(pokerPersonalMode(state, 0)).toBe('discard');
    state.phase = 'finished';
    expect(pokerPersonalMode(state, 0)).toBe('result');
  });
  it('keeps the winner and relevant hand summary in the personal result state', () => {
    const state = result();
    expect(pokerPanelCopy(state, 4, seats)).toMatchObject({
      title: 'You win',
      detail: 'Two pair',
      highlight: true,
    });
    expect(pokerPanelCopy(state, 0, seats)).toMatchObject({
      title: 'Player 4 wins',
      detail: 'Two pair',
      highlight: false,
    });
    state.end = 'fold';
    expect(pokerPanelCopy(state, 4, seats).detail).toBe('Uncalled hand');
    state.winnerSeatIndexes = [0, 4];
    expect(pokerPanelCopy(state, 0, seats).title).toBe('Split pot · 2 winners');
  });
  it('shows the latest action while waiting and a direct instruction during discards', () => {
    const state = result();
    state.phase = 'play';
    state.turnSeatIndex = 0;
    expect(pokerPanelCopy(state, 2, seats, 'Player 4 calls 20')).toMatchObject({
      title: 'Player 0’s turn',
      detail: 'Player 4 calls 20',
    });
    state.step = 'discard';
    expect(pokerPanelCopy(state, 0, seats).title).toBe('Discard 1 card');
    expect(pokerPanelCopy(state, 2, seats).title).toBe(
      'Player 0 is discarding',
    );
  });
  it('keeps full rail clusters clear of the public board, other seats, and personal band', () => {
    for (let players = 2; players <= 8; players++) {
      const boxes = pokerSeatPanels(seats.slice(0, players));
      expect(boxes).toHaveLength(players - 1);
      const clusters = boxes.map((box) => ({ ...box, y: box.y - 84, h: 160 }));
      for (const [index, box] of clusters.entries()) {
        expect(rectsOverlap(box, POKER_CENTER)).toBe(false);
        expect(box.y + box.h).toBeLessThan(POKER_USER_Y);
        for (let control = 0; control < 5; control += 1)
          expect(rectsOverlap(box, pokerActionBox(control))).toBe(false);
        for (const other of clusters.slice(index + 1))
          expect(rectsOverlap(box, other)).toBe(false);
        expect(box.x + box.w).toBeLessThanOrEqual(960);
        expect(box.y).toBeGreaterThanOrEqual(60);
      }
    }
  });
  it('offers only showdown contenders and defaults to the winner', () => {
    expect(showdownSeats(result())).toEqual([4, 0, 2, 3, 5, 7]);
  });
  it('fits all eight player panels for a spectator without a personal action cluster', () => {
    const boxes = pokerSeatPanels(
      seats.map((seat) => ({ ...seat, self: false })),
    ).map((box) => ({ ...box, y: box.y - 84, h: 160 }));
    expect(boxes).toHaveLength(8);
    for (const [index, box] of boxes.entries()) {
      expect(rectsOverlap(box, POKER_CENTER)).toBe(false);
      expect(box.y + box.h).toBeLessThan(POKER_USER_Y);
      for (const other of boxes.slice(index + 1))
        expect(rectsOverlap(box, other)).toBe(false);
    }
  });
  it('never offers folded or uncalled hands, or reveals a live betting hand', () => {
    const state = result();
    state.end = 'fold';
    expect(showdownSeats(state)).toEqual([]);
    state.phase = 'play';
    state.end = null;
    for (const row of Object.values(state.seats)) row.allIn = true;
    expect(showdownSeats(state)).toEqual([]);
  });
});

it('distinguishes different main/side winners from an actual tied pot', () => {
  const state = result();
  state.winnerSeatIndexes = [0, 4];
  state.hands = {
    '0': { cards: [], name: 'four of a kind', score: [7, 14] },
    '4': { cards: [], name: 'full house', score: [6, 9] },
  };
  state.pots = [
    { amount: 120, eligible: [0, 4] },
    { amount: 40, eligible: [4] },
  ];
  expect(pokerPanelCopy(state, 0, seats).title).toBe('Different pot winners');
});
