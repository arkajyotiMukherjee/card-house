import { describe, expect, it } from 'vitest';
import type { PokerState } from '../../src/shared/games/poker';
import { HAND_Y } from './bluff-layout';
import { pokerBlindMark } from '../../src/shared/games/poker';
import {
  BANNER_Y,
  BET_BUTTON,
  BOARD_Y,
  CALL_BUTTON,
  CARD_DRAW,
  COUNTDOWN_Y,
  CHECK_BUTTON,
  FOLD_BUTTON,
  RAISE_BUTTON,
  STAKE_AMOUNT,
  STAKE_CANCEL,
  STAKE_CONFIRM,
  STAKE_DOWN,
  STAKE_MAX,
  STAKE_UP,
  bannerX,
  blindChipLine,
  boardFlip,
  boardPositions,
  droppedPositions,
  faceForPokerCard,
  finishedLine,
  frontStakeControl,
  holePositions,
  moveStake,
  nextHandCountdown,
  POT_CHIP_BOTTOM,
  seatNote,
} from './poker-layout';
import { POKER_HAND_PAUSE_MS } from '../../src/shared/games/poker';
import {
  FELT_BOTTOM,
  belowFelt,
  fanCardRect,
  fanGapLine,
  insideCluster,
  opponentNameAnchor,
  rectsOverlap,
  seatPlateWidth,
} from './table-presentation';

function finished(winners: number[]): PokerState {
  return {
    phase: 'finished',
    variation: 'holdem',
    street: 'river',
    step: 'bet',
    handNumber: 1,
    deck: [],
    board: ['AS', 'KS', 'QS', 'JS', '10S'],
    seats: {},
    order: [0, 1],
    dealerSeatIndex: 0,
    turnSeatIndex: null,
    currentBet: 0,
    minRaise: 20,
    pot: 40,
    pots: [],
    winnerSeatIndexes: winners,
    hands: {},
    end: 'showdown',
    smallBlind: 10,
    bigBlind: 20,
    limit: 'no-limit',
  };
}

describe('poker layout', () => {
  it('counts the pause from 10 down to 1 and keeps the board under the pot', () => {
    expect(POKER_HAND_PAUSE_MS).toBe(10_000);
    expect(nextHandCountdown(0)).toBe('Next hand in 10');
    expect(nextHandCountdown(999)).toBe('Next hand in 10');
    expect(nextHandCountdown(1_000)).toBe('Next hand in 9');
    expect(nextHandCountdown(9_000)).toBe('Next hand in 1');
    expect(nextHandCountdown(9_999)).toBe('Next hand in 1');
    expect(nextHandCountdown(POKER_HAND_PAUSE_MS)).toBeNull();
    expect(nextHandCountdown(POKER_HAND_PAUSE_MS + 500)).toBeNull();
    const boardTop = BOARD_Y - CARD_DRAW / 2;
    const boardBottom = BOARD_Y + CARD_DRAW / 2;
    expect(boardTop).toBeGreaterThan(POT_CHIP_BOTTOM);
    expect(BANNER_Y).toBeGreaterThanOrEqual(POT_CHIP_BOTTOM);
    expect(COUNTDOWN_Y).toBeGreaterThan(BANNER_Y);
    expect(boardTop).toBeGreaterThan(COUNTDOWN_Y);
    expect(boardBottom).toBeLessThan(FELT_BOTTOM);
    const board = boardPositions(5);
    expect(board.every((slot) => slot.y === BOARD_Y)).toBe(true);
    expect(BOARD_Y).toBeGreaterThan(POT_CHIP_BOTTOM);
  });

  it('puts the board in the center and your hole cards on the shared hand row', () => {
    const board = boardPositions(5);
    expect(board).toHaveLength(5);
    expect(board.every((slot) => slot.y === BOARD_Y)).toBe(true);
    expect(board[0]?.x).toBeLessThan(board[2]?.x ?? 0);
    expect(board[2]?.x).toBe(480);
    expect(boardFlip(0)).toEqual({ scaleX: 1, face: false, done: false });
    expect(boardFlip(140).face).toBe(true);
    expect(boardFlip(140).scaleX).toBe(0);
    expect(boardFlip(280)).toEqual({ scaleX: 1, face: true, done: true });
    const mine = holePositions(true, 480, 456, 2);
    expect(mine).toHaveLength(2);
    expect(mine.every((slot) => slot.y === HAND_Y)).toBe(true);
    const theirs = holePositions(false, 180, 310, 4, 'Ada');
    expect(theirs).toHaveLength(4);
    expect(theirs.every((slot) => slot.rotation !== 0)).toBe(true);
    expect(mine.every((slot) => slot.rotation === 0)).toBe(true);
  });

  it('maps a card id onto the shared suit sheet', () => {
    expect(faceForPokerCard('10H')).toEqual({ rank: '10', suit: 'hearts' });
    expect(faceForPokerCard('AS')).toEqual({ rank: 'A', suit: 'spades' });
    expect(faceForPokerCard('nope')).toBeNull();
  });

  it('names the subscribed winners', () => {
    const seats = [
      { seatIndex: 0, name: 'Ada' },
      { seatIndex: 1, name: 'Bea' },
    ];
    expect(finishedLine(finished([0]), seats)).toBe('Winner is Ada');
    expect(finishedLine(finished([0, 1]), seats)).toBe(
      'Winners are Ada and Bea',
    );
    expect(finishedLine(finished([0]), seats)).not.toMatch(/\d/);
    expect(finishedLine({ ...finished([]), phase: 'play' }, seats)).toBeNull();
    expect(finishedLine(finished([0]), [{ seatIndex: 0, name: '' }])).toBe(
      'Winner',
    );
  });

  it('puts chips and the bet in the fan gap, clear of the hole cards', () => {
    const name = 'Ada';
    const slots = holePositions(false, 780, 310, 2, name);
    const plate = opponentNameAnchor(780, 310, name);
    const chips = fanGapLine(780, 310, name, '100', 0);
    const bet = fanGapLine(780, 310, name, 'Bet 40', 1);
    expect(chips.y).toBeGreaterThan(plate.y);
    expect(bet.y).toBeGreaterThan(chips.y);
    const lines = [
      { x: chips.x, y: chips.y, w: '100'.length * 8, h: 8 },
      { x: bet.x, y: bet.y, w: 'Bet 40'.length * 8, h: 8 },
    ];
    for (const slot of slots) {
      const card = fanCardRect(slot);
      for (const line of lines) {
        const hit =
          line.x < card.x + card.w &&
          line.x + line.w > card.x &&
          line.y < card.y + card.h &&
          line.y + line.h > card.y;
        expect(hit).toBe(false);
      }
    }
    expect(seatPlateWidth(name)).toBeGreaterThan(0);
    expect(bannerX('Winner is Ada')).toBeGreaterThanOrEqual(280);
    expect(bannerX('x'.repeat(200))).toBe(280);
  });

  it('puts dropped cards below the felt and clear of the cluster', () => {
    const slots = droppedPositions(3);
    expect(slots).toHaveLength(2);
    expect(slots.every((slot) => belowFelt(slot))).toBe(true);
    for (const slot of slots) {
      expect(insideCluster({ x: slot.x, y: slot.y, w: 48, h: 48 })).toBe(false);
    }
    expect(slots[0]?.x).toBeLessThan(200);
  });

  it('keeps Fold, Check, Call, Bet, and Raise in the cluster', () => {
    for (const button of [
      FOLD_BUTTON,
      CHECK_BUTTON,
      CALL_BUTTON,
      BET_BUTTON,
      RAISE_BUTTON,
    ]) {
      expect(belowFelt(button)).toBe(true);
      expect(insideCluster(button)).toBe(true);
    }
  });

  it('keeps the bet amount control in the cluster, below the felt', () => {
    for (const button of [
      STAKE_DOWN,
      STAKE_UP,
      STAKE_AMOUNT,
      STAKE_MAX,
      STAKE_CONFIRM,
      STAKE_CANCEL,
    ]) {
      expect(belowFelt(button)).toBe(true);
      expect(insideCluster(button)).toBe(true);
    }
    expect(moveStake(20, -20, 20, 980)).toBe(20);
    expect(moveStake(20, 20, 20, 980)).toBe(40);
    expect(moveStake(960, 20, 20, 980)).toBe(980);
  });

  it('gives one stake control the click, including a shared edge', () => {
    const boxes = [
      { id: 'stake-down', ...STAKE_DOWN },
      { id: 'stake-up', ...STAKE_UP },
      { id: 'stake-max', ...STAKE_MAX },
      { id: 'stake-confirm', ...STAKE_CONFIRM },
      { id: 'stake-cancel', ...STAKE_CANCEL },
    ];
    const down = boxes[0]!;
    const up = boxes[1]!;
    expect(up.x).toBeGreaterThan(down.x + down.w);
    const y = down.y + Math.floor(down.h / 2);
    expect(frontStakeControl(boxes, { x: down.x + down.w - 1, y })).toBe(
      'stake-down',
    );
    expect(frontStakeControl(boxes, { x: up.x, y })).toBe('stake-up');
    expect(frontStakeControl(boxes, { x: down.x + down.w, y })).toBeNull();
    for (let x = down.x; x < down.x + down.w; x += 1) {
      for (let row = down.y; row < down.y + down.h; row += 1) {
        expect(frontStakeControl(boxes, { x, y: row })).toBe('stake-down');
      }
    }

    const touching = [
      { id: 'stake-down', x: 0, y: 0, w: 96, h: 28 },
      { id: 'stake-up', x: 96, y: 0, w: 96, h: 28 },
    ];
    expect(frontStakeControl(touching, { x: 95, y: 14 })).toBe('stake-down');
    expect(frontStakeControl(touching, { x: 96, y: 14 })).toBe('stake-up');
    expect(frontStakeControl(touching, { x: 95, y: 28 })).toBeNull();

    const overlap = [
      { id: 'stake-down', x: 0, y: 0, w: 96, h: 28 },
      { id: 'stake-up', x: 48, y: 0, w: 96, h: 28 },
    ];
    expect(frontStakeControl(overlap, { x: 60, y: 10 })).toBe('stake-up');
    expect(frontStakeControl(overlap, { x: 20, y: 10 })).toBe('stake-down');
  });

  it('labels the small and big blind from the button', () => {
    const headsUp = finished([0]);
    expect(pokerBlindMark(headsUp, 0)).toBe('SB');
    expect(pokerBlindMark(headsUp, 1)).toBe('BB');
    const moved = { ...headsUp, dealerSeatIndex: 1 };
    expect(pokerBlindMark(moved, 1)).toBe('SB');
    expect(pokerBlindMark(moved, 0)).toBe('BB');
    const three = {
      ...headsUp,
      phase: 'play' as const,
      end: null,
      order: [0, 1, 2],
      dealerSeatIndex: 0,
    };
    expect(pokerBlindMark(three, 0)).toBeNull();
    expect(pokerBlindMark(three, 1)).toBe('SB');
    expect(pokerBlindMark(three, 2)).toBe('BB');
    const buttonMoved = { ...three, dealerSeatIndex: 1 };
    expect(pokerBlindMark(buttonMoved, 2)).toBe('SB');
    expect(pokerBlindMark(buttonMoved, 0)).toBe('BB');
    expect(pokerBlindMark(buttonMoved, 1)).toBeNull();
    expect(pokerBlindMark({ ...three, phase: 'finished' }, 1)).toBe('SB');
    expect(pokerBlindMark({ ...headsUp, phase: 'lobby' }, 0)).toBeNull();
  });

  it('puts SB and BB beside the name and clear of the hole cards', () => {
    const seats = [
      { x: 780, y: 310, name: 'Ada' },
      { x: 180, y: 310, name: 'Bea' },
      { x: 480, y: 72, name: 'Cam' },
      { x: 280, y: 456, name: 'Dee' },
    ];
    for (const seat of seats) {
      const line = blindChipLine(
        false,
        seat.x,
        seat.y,
        seat.name,
        '1000',
        'SB',
      );
      expect(line.mark).not.toBeNull();
      const bits = [
        { x: line.mark?.x ?? 0, y: line.mark?.y ?? 0, w: 16, h: 8 },
        { x: line.chips.x, y: line.chips.y, w: 32, h: 8 },
      ];
      const slots = holePositions(false, seat.x, seat.y, 4, seat.name);
      for (const slot of slots) {
        const card = fanCardRect(slot);
        for (const bit of bits) {
          expect(rectsOverlap(bit, card)).toBe(false);
        }
      }
      const plate = opponentNameAnchor(seat.x, seat.y, seat.name);
      expect(line.mark?.y).toBeGreaterThanOrEqual(plate.y);
      expect(Math.abs((line.mark?.x ?? 0) - plate.x)).toBeLessThan(
        seatPlateWidth(seat.name),
      );
    }
    const mine = blindChipLine(true, 480, 456, 'Ada', '980', 'BB');
    expect(mine.mark?.x).toBeGreaterThan(480);
    expect(mine.chips.x).toBeGreaterThan(mine.mark?.x ?? 0);
  });

  it('notes folds, bets, all-ins, and showdown hands', () => {
    const base = finished([0]);
    const row = {
      chips: 100,
      hole: ['AS', 'KD'],
      streetBet: 0,
      committed: 20,
      folded: false,
      allIn: false,
      acted: true,
      mustDiscard: false,
    };
    const play: PokerState = {
      ...base,
      phase: 'play',
      end: null,
      seats: {
        '0': { ...row, streetBet: 40 },
        '1': { ...row, folded: true },
        '2': { ...row, allIn: true },
        '3': row,
      },
    };
    expect(seatNote(play, 0)).toBe('Bet 40');
    expect(seatNote(play, 1)).toBe('Fold');
    expect(seatNote(play, 2)).toBe('All-in');
    expect(seatNote(play, 3)).toBeNull();
    const showdown: PokerState = {
      ...base,
      seats: play.seats,
      hands: { '0': { cards: [], name: 'Flush', score: [5] } },
    };
    expect(seatNote(showdown, 0)).toBe('Flush');
    expect(seatNote(showdown, 1)).toBe('Fold');
  });
});
