import { describe, expect, it } from 'vitest';
import type { SpadesState } from '../../src/shared/games/spades';
import { TABLE_CENTER } from './bluff-layout';
import {
  PARTNERSHIP_BOARD,
  PLAY_BUTTON,
  bidButtonBox,
  bidButtonLabel,
  finishedLine,
  legalCard,
  partnershipBoard,
  seatBidText,
  seatTeam,
  trickPosition,
  wonTrickPosition,
} from './spades-layout';
import {
  ACTION_CLUSTER,
  PICKER_Y,
  belowFelt,
  fanGapLine,
  insideCluster,
  opponentNameAnchor,
} from './table-presentation';

function state(overrides: Partial<SpadesState> = {}): SpadesState {
  return {
    phase: 'play',
    stage: 'trick',
    hands: {
      '0': ['AS', '2H'],
      '1': ['KD'],
      '2': ['QC'],
      '3': ['JS'],
    },
    bids: { '0': 3, '1': 0, '2': 2, '3': 4 },
    tricks: { '0': 1, '1': 0, '2': 2, '3': 1 },
    trick: [],
    lastTrick: null,
    spadesBroken: false,
    turnSeatIndex: 0,
    dealerSeatIndex: 3,
    scores: { ns: 120, ew: -40 },
    bags: { ns: 2, ew: 0 },
    handNumber: 1,
    winnerTeam: null,
    tableId: 'table-spades',
    ...overrides,
  };
}

describe('spades layout', () => {
  it('wraps bid buttons in the green band and tricks toward each seat', () => {
    const nil = bidButtonBox(0);
    const six = bidButtonBox(6);
    const seven = bidButtonBox(7);
    const last = bidButtonBox(13);
    expect(nil.y).toBe(PICKER_Y);
    expect(nil.y).toBe(last.y);
    expect(nil.y).not.toBe(416);
    expect(belowFelt(nil)).toBe(true);
    expect(nil.x).toBeLessThan(six.x);
    expect(seven.x).toBeGreaterThan(six.x + six.w + 8);
    expect(last.x + last.w).toBeLessThan(ACTION_CLUSTER.x);
    expect(belowFelt(PLAY_BUTTON)).toBe(true);
    expect(insideCluster(PLAY_BUTTON)).toBe(true);
    const name = opponentNameAnchor(780, 310, 'Ada');
    const bid = fanGapLine(780, 310, 'Ada', 'Bid 3 took 1', 0);
    expect(bid.y).toBeGreaterThan(name.y);
    const trick = trickPosition(780, 310);
    expect(trick.x).toBeGreaterThan(TABLE_CENTER.x);
    expect(trick.x).toBeLessThan(780);
    const won = wonTrickPosition(480, 72, 1);
    expect(won.y).toBeLessThan(TABLE_CENTER.y);
    expect(won.x).toBe(trickPosition(480, 72).x + 12);
  });

  it('draws partnership bids, tricks, and scores', () => {
    expect(partnershipBoard(state())).toEqual({
      trump: 'Spades held',
      nsHead: 'NS',
      nsBid: 'bid 5 won 3',
      nsScore: '120 bags 2',
      ewHead: 'EW',
      ewBid: 'bid 4 won 1',
      ewScore: '-40 bags 0',
    });
    expect(partnershipBoard(state({ spadesBroken: true })).trump).toBe(
      'Spades broken',
    );
    expect(seatBidText(state(), 1)).toBe('Nil took 0');
    expect(seatBidText(state(), 0)).toBe('Bid 3 took 1');
  });

  it('marks the viewer partnership and shows who is bidding', () => {
    expect(partnershipBoard(state(), 0).nsHead).toBe('NS (you)');
    expect(partnershipBoard(state(), 0).ewHead).toBe('EW');
    expect(partnershipBoard(state(), 3).ewHead).toBe('EW (you)');
    expect(partnershipBoard(state(), null).nsHead).toBe('NS');
    expect(seatTeam(0)).toBe('ns');
    expect(seatTeam(2)).toBe('ns');
    expect(seatTeam(1)).toBe('ew');
    const bidding = state({
      stage: 'bid',
      bids: { '0': null, '1': null },
      turnSeatIndex: 0,
    });
    expect(seatBidText(bidding, 0)).toBe('Bidding');
    expect(seatBidText(bidding, 1)).toBe('');
    expect(bidButtonLabel(0)).toBe('Nil');
    expect(bidButtonLabel(7)).toBe('7');
  });

  it('keeps the board rows and chips on the left of the felt', () => {
    const { rows, chipRows, x, chipX } = PARTNERSHIP_BOARD;
    expect(chipX + 32).toBeLessThan(x);
    expect([...rows]).toEqual([...rows].sort((a, b) => a - b));
    expect(chipRows[1] - chipRows[0]).toBeGreaterThanOrEqual(32);
  });

  it('lifts a card only on your turn during the trick', () => {
    const table = state();
    expect(legalCard(table, 0, 'AS')).toBe(true);
    expect(legalCard(table, 0, 'KD')).toBe(false);
    expect(legalCard(state({ turnSeatIndex: 1 }), 0, 'AS')).toBe(false);
    expect(legalCard(state({ stage: 'bid' }), 0, 'AS')).toBe(false);
  });

  it('names the winning partnership when the rules finish', () => {
    expect(finishedLine(state())).toBeNull();
    expect(
      finishedLine(
        state({
          phase: 'finished',
          winnerTeam: 'ns',
          scores: { ns: 600, ew: -20 },
        }),
      ),
    ).toBe('NS wins 600 to -20');
  });
});
