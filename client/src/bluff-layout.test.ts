import { describe, expect, it } from 'vitest';
import type { BluffState } from '../../src/shared/games/bluff';
import { BUTTON_HEIGHT } from './button-style';
import { seatAnchorsFor } from './game-scene';
import {
  BLUFF_CHALLENGE_BUTTON,
  BLUFF_PASS_BUTTON,
  BLUFF_PLAY_BUTTON,
  BLUFF_RANK_HINT,
  CARD_DRAW,
  HAND_Y,
  PILE_NOTICE_Y,
  PILE_X,
  PILE_Y,
  RANK_FILL,
  RANK_FILL_CHOSEN,
  canChallenge,
  canPass,
  canPlay,
  cardLift,
  faceForCard,
  finishedLine,
  handPositions,
  leadRankHint,
  legalCard,
  pileFaceUp,
  pileNotice,
  pilePositions,
  rankButtonColors,
  rankCallButtons,
  rankHintPos,
  selectedPlayCards,
  showRankPicker,
  tablePrompt,
  turnLine,
} from './bluff-layout';
import {
  PICKER_RIGHT,
  belowFelt,
  coversCluster,
  fanCardBottom,
  fanCardRect,
  fanEdge,
  insideCluster,
  opponentCountAnchor,
  opponentNameAnchor,
  seatFan,
  seatPlateWidth,
  type CardRect,
} from './table-presentation';

function overlaps(a: CardRect, b: CardRect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function playState(turnSeatIndex: number | null): BluffState {
  return {
    phase: 'play',
    hands: { '0': ['AS', '10H'], '1': ['KD', 'QC'] },
    discardPile: [],
    requiredRank: 'A',
    passed: [],
    playCounts: {},
    turnCounts: {},
    turnSeatIndex,
    lastPlay: null,
    winnerSeatIndex: null,
  };
}

describe('bluff layout', () => {
  it('puts your hand along the bottom and the pile in the center', () => {
    const hand = handPositions(26);
    expect(hand).toHaveLength(26);
    expect(hand.every((slot) => slot.y === HAND_Y)).toBe(true);
    expect(hand[0]?.x).toBeLessThan(hand[1]?.x ?? 0);
    expect(hand[0]?.x).toBeGreaterThan(16);
    expect(hand[25]?.x).toBeLessThan(736);
    const pile = pilePositions(1);
    expect(pile).toEqual([{ x: PILE_X, y: PILE_Y }]);
  });

  it('sets each fan on that seat edge and grows it inward', () => {
    const anchors = seatAnchorsFor(4);
    const right = anchors[1];
    const left = anchors[2];
    const top = anchors[3];
    expect(right && fanEdge(right.x, right.y)).toBe('right');
    expect(left && fanEdge(left.x, left.y)).toBe('left');
    expect(top && fanEdge(top.x, top.y)).toBe('top');
    const seats = [
      { seat: left, edge: 'left' as const },
      { seat: right, edge: 'right' as const },
      { seat: top, edge: 'top' as const },
    ];
    for (const row of seats) {
      expect(row.seat).toBeDefined();
      if (!row.seat) {
        continue;
      }
      const slots = seatFan(row.seat.x, row.seat.y, 17, 'Ada');
      expect(slots).toHaveLength(17);
      let alongX = 0;
      let alongY = 0;
      let inward = 0;
      for (const slot of slots) {
        const bottom = fanCardBottom(slot);
        alongX += slot.x;
        alongY += slot.y;
        if (row.edge === 'left') {
          expect(bottom.x).toBeLessThan(28);
          expect(slot.x).toBeGreaterThan(bottom.x + 8);
          inward += slot.x;
        } else if (row.edge === 'right') {
          expect(bottom.x).toBeGreaterThan(960 - 28);
          expect(slot.x).toBeLessThan(bottom.x - 8);
          inward += 960 - slot.x;
        } else {
          expect(bottom.y).toBeLessThan(96);
          expect(slot.y).toBeGreaterThan(bottom.y + 8);
          inward += slot.y;
        }
      }
      const name = opponentNameAnchor(row.seat.x, row.seat.y, 'Ada');
      const count = opponentCountAnchor(row.seat.x, row.seat.y, 17, 'Ada');
      const nameRect = {
        x: name.x,
        y: name.y,
        w: seatPlateWidth('Ada'),
        h: 20,
      };
      const countRect = { x: count.x, y: count.y, w: 'x17'.length * 8, h: 8 };
      const fanCenter = {
        x: alongX / slots.length,
        y: alongY / slots.length,
      };
      const plateCenter = {
        x: name.x + nameRect.w / 2,
        y: name.y + nameRect.h / 2,
      };
      if (row.edge === 'right') {
        const alongs = slots.map((slot) => slot.y);
        const low = Math.min(...alongs);
        const high = Math.max(...alongs);
        expect(plateCenter.y).toBeGreaterThan(low);
        expect(plateCenter.y).toBeLessThan(high);
        expect(slots.every((slot) => !coversCluster(slot))).toBe(true);
      } else if (row.edge === 'top') {
        expect(Math.abs(plateCenter.x - fanCenter.x)).toBeLessThan(12);
      } else {
        expect(Math.abs(plateCenter.y - fanCenter.y)).toBeLessThan(12);
      }
      for (const slot of slots) {
        const rect = fanCardRect(slot);
        expect(overlaps(nameRect, rect)).toBe(false);
        expect(overlaps(countRect, rect)).toBe(false);
      }
      expect(inward / slots.length).toBeGreaterThan(16);
    }
  });

  it('lifts a card only when it is legal to play', () => {
    const state = playState(0);
    expect(legalCard(state, 0, 'AS')).toBe(true);
    expect(legalCard(state, 0, 'KD')).toBe(false);
    expect(legalCard(playState(1), 0, 'AS')).toBe(false);
    expect(legalCard({ ...state, phase: 'lobby' }, 0, 'AS')).toBe(false);
    expect(
      cardLift({ legal: true, hovered: true, selected: false }),
    ).toBeGreaterThan(0);
    expect(cardLift({ legal: false, hovered: true, selected: true })).toBe(0);
  });

  it('builds the whole selection into one play, in hand order', () => {
    expect(
      selectedPlayCards(['AS', '10H', 'KD'], new Set(['KD', 'AS'])),
    ).toEqual(['AS', 'KD']);
    expect(selectedPlayCards(['AS', '10H', 'KD'], new Set(['10H']))).toEqual([
      '10H',
    ]);
    expect(faceForCard('10H')).toEqual({ rank: '10', suit: 'hearts' });
    expect(faceForCard('AS')).toEqual({ rank: 'A', suit: 'spades' });
    expect(faceForCard('nope')).toBeNull();
  });

  it('shows your last play face up on the pile', () => {
    const state: BluffState = {
      ...playState(1),
      discardPile: ['AS'],
      lastPlay: { seat: 0, cards: ['AS'], claimRank: 'A' },
    };
    expect(pileFaceUp(state, 'AS', 0)).toBe(true);
    expect(pileFaceUp(state, 'AS', 1)).toBe(false);
  });

  it('names the called rank without fixing the count', () => {
    expect(tablePrompt(playState(0), 0)).toBe('Play Aces');
    expect(tablePrompt(playState(0), 1)).toBe('Play Aces');
    expect(tablePrompt({ ...playState(0), requiredRank: '4' }, 1)).toBe(
      'Play Fours',
    );
    expect(tablePrompt({ ...playState(0), requiredRank: '6' }, 0)).toBe(
      'Play Sixes',
    );
    const calling = { ...playState(0), requiredRank: null };
    expect(tablePrompt(calling, 0)).toBe('Call a rank');
    expect(tablePrompt(calling, 1)).toBeNull();
    expect(turnLine(calling, 0)).toBe('Your turn');
    expect(turnLine(calling, 1)).toBe('Wait');
    expect(showRankPicker(calling, 1)).toBe(false);
    expect(tablePrompt(playState(0), 0)).not.toContain('Play one');
  });

  it('states the latest claim above the pile', () => {
    const seats = [
      { seatIndex: 0, name: 'Ada' },
      { seatIndex: 1, name: 'Bea' },
    ];
    expect(
      pileNotice(
        {
          ...playState(0),
          lastPlay: { seat: 1, cards: ['QD', 'QC'], claimRank: 'Q' },
        },
        seats,
      ),
    ).toBe('Bea played 2 Queens');
    expect(
      pileNotice(
        {
          ...playState(0),
          lastPlay: { seat: 1, cards: ['QD'], claimRank: 'Q' },
        },
        seats,
      ),
    ).toBe('Bea played 1 Queen');
    expect(pileNotice(playState(0), seats)).toBeNull();
    expect(PILE_NOTICE_Y + 20).toBeLessThan(PILE_Y - CARD_DRAW / 2);
  });

  it('asks the lead to select a rank and fills only the chosen one', () => {
    const leading = { ...playState(0), requiredRank: null };
    expect(showRankPicker(leading, 0)).toBe(true);
    expect(showRankPicker(playState(0), 0)).toBe(false);
    expect(leadRankHint(leading, 0, false)).toBe(BLUFF_RANK_HINT);
    expect(leadRankHint(leading, 0, true)).toBeNull();
    expect(leadRankHint(playState(0), 0, false)).toBeNull();
    expect(rankButtonColors(true).fill).toBe(RANK_FILL_CHOSEN);
    expect(rankButtonColors(false).fill).toBe(RANK_FILL);
    expect(rankButtonColors(true).fill).not.toBe(rankButtonColors(false).fill);
    const hint = rankHintPos();
    expect(hint.x + BLUFF_RANK_HINT.length * 8).toBeLessThanOrEqual(
      PICKER_RIGHT,
    );
    const ranks = rankCallButtons();
    const localSeat = seatAnchorsFor(2)[0]!;
    expect(ranks.every((button) => button.y + button.h < localSeat.y - 6)).toBe(
      true,
    );
    expect(hint.y).toBeGreaterThanOrEqual(ranks[0]!.y);
    expect(hint.y + 8).toBeLessThanOrEqual(ranks[0]!.y + BUTTON_HEIGHT);
    expect(ranks[0]?.x).toBeLessThan(ranks.at(-1)?.x ?? 0);
    const hintRect = {
      x: hint.x,
      y: hint.y,
      w: BLUFF_RANK_HINT.length * 8,
      h: 8,
    };
    for (const button of ranks) {
      const rect = { x: button.x, y: button.y, w: button.w, h: button.h };
      const overlapsHint =
        hintRect.x < rect.x + rect.w &&
        hintRect.x + hintRect.w > rect.x &&
        hintRect.y < rect.y + rect.h &&
        hintRect.y + hintRect.h > rect.y;
      expect(overlapsHint).toBe(false);
    }
  });

  it('keeps turn controls in the cluster, below the felt and clear of the hand', () => {
    const hand = handPositions(26);
    const handRight = Math.max(...hand.map((slot) => slot.x)) + CARD_DRAW / 2;
    for (const button of [
      BLUFF_PLAY_BUTTON,
      BLUFF_PASS_BUTTON,
      BLUFF_CHALLENGE_BUTTON,
    ]) {
      expect(button.x).toBeGreaterThanOrEqual(handRight);
      expect(belowFelt(button)).toBe(true);
      expect(insideCluster(button)).toBe(true);
      expect(button.h).toBe(BUTTON_HEIGHT);
    }
    expect(BLUFF_PASS_BUTTON.y).toBe(BLUFF_PLAY_BUTTON.y);
    expect(BLUFF_PASS_BUTTON.x).toBeGreaterThan(BLUFF_PLAY_BUTTON.x);
    expect(BLUFF_CHALLENGE_BUTTON.y).toBeGreaterThan(BLUFF_PLAY_BUTTON.y);
  });

  it('shows a full action only while that action is legal', () => {
    const finished: BluffState = {
      ...playState(null),
      phase: 'finished',
      winnerSeatIndex: 0,
      lastPlay: { seat: 1, cards: ['KD'], claimRank: 'A' },
    };
    expect(canPlay(finished, 0)).toBe(false);
    expect(canPass(finished, 0)).toBe(false);
    expect(canChallenge(finished, 0)).toBe(false);
    expect(showRankPicker(finished, 0)).toBe(false);
    expect(canPlay(playState(1), 0)).toBe(false);
    expect(canPass(playState(1), 0)).toBe(false);
    const waiting: BluffState = {
      ...playState(1),
      lastPlay: { seat: 1, cards: ['KD'], claimRank: 'A' },
    };
    expect(canChallenge(waiting, 0)).toBe(true);
    expect(canPass(playState(0), 0)).toBe(true);
    expect(canPass({ ...playState(0), requiredRank: null }, 0)).toBe(false);
    expect(canChallenge(playState(0), 0)).toBe(false);
  });

  it('names the subscribed winner seat when the rules finish', () => {
    const seats = [
      { seatIndex: 0, name: 'Ada' },
      { seatIndex: 1, name: 'Bea' },
    ];
    expect(finishedLine(playState(0), seats)).toBeNull();
    expect(
      finishedLine(
        { ...playState(1), phase: 'finished', winnerSeatIndex: 0 },
        seats,
      ),
    ).toBe('Winner is Ada');
    expect(
      finishedLine(
        { ...playState(null), phase: 'finished', winnerSeatIndex: null },
        seats,
      ),
    ).toBe('Finished');
  });
});

it('groups matching ranks without mutating the dealt hand or losing jokers', async () => {
  const { orderedBluffHand } = await import('./bluff-layout');
  const cards = ['KH', '2S', 'AC', 'JB', '2D', '10H', 'JR'];
  expect(orderedBluffHand(cards)).toEqual([
    'AC',
    '2D',
    '2S',
    '10H',
    'KH',
    'JB',
    'JR',
  ]);
  expect(cards).toEqual(['KH', '2S', 'AC', 'JB', '2D', '10H', 'JR']);
});

it('keeps the winner below even a full-deck opponent fan and above the pile', async () => {
  const { WINNER_BANNER_Y, WINNER_BANNER_Z, PILE_Y } =
    await import('./bluff-layout');
  const { seatFan, fanCardRect } = await import('./table-presentation');
  for (const count of [2, 13, 27, 54]) {
    for (const slot of seatFan(480, 96, count, 'Sani Kumar')) {
      const card = fanCardRect(slot);
      expect(card.y + card.h).toBeLessThan(WINNER_BANNER_Y);
    }
  }
  expect(WINNER_BANNER_Y + 32).toBeLessThan(PILE_Y - 32);
  expect(WINNER_BANNER_Z).toBeGreaterThan(4 + 54);
});
