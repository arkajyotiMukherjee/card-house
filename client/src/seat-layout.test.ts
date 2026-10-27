import { describe, expect, it } from 'vitest';
import { HAND_Y, PILE_X, PILE_Y } from './bluff-layout';
import {
  HOW_TO_PLAY_BUTTON,
  LEAVE_TABLE_BUTTON,
  TABLE_CHAT_BUTTON,
  seatAnchorsFor,
  type SeatEdge,
} from './game-scene';
import { boardPositions } from './poker-layout';
import { STATUS_HUD } from './status-hud';
import {
  ACTION_CLUSTER,
  fanCardBottom,
  fanCardRect,
  fanEdge,
  fanGapLine,
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

const HAND: CardRect = { x: 16, y: HAND_Y - 32, w: 720, h: 64 };
const PILE: CardRect = { x: PILE_X - 52, y: PILE_Y - 40, w: 104, h: 80 };
const STATS: CardRect = { x: 280, y: 16, w: 176, h: 20 };

const CHROME: { name: string; box: CardRect }[] = [
  { name: 'leave', box: { ...LEAVE_TABLE_BUTTON } },
  { name: 'chat', box: { ...TABLE_CHAT_BUTTON } },
  { name: 'help', box: { ...HOW_TO_PLAY_BUTTON } },
  { name: 'hud', box: { ...STATUS_HUD } },
  { name: 'stats', box: STATS },
  { name: 'hand', box: HAND },
  { name: 'cluster', box: { ...ACTION_CLUSTER } },
  { name: 'pile', box: PILE },
];

for (const slot of boardPositions(5)) {
  CHROME.push({
    name: 'board',
    box: { x: slot.x - 32, y: slot.y - 32, w: 64, h: 64 },
  });
}

const EDGES: Record<number, SeatEdge[]> = {
  2: ['bottom', 'top'],
  3: ['bottom', 'right', 'left'],
  4: ['bottom', 'right', 'left', 'top'],
  5: ['bottom', 'right', 'top', 'top', 'left'],
  6: ['bottom', 'right', 'top', 'top', 'top', 'left'],
  7: ['bottom', 'right', 'right', 'top', 'top', 'left', 'left'],
  8: ['bottom', 'right', 'right', 'top', 'top', 'top', 'left', 'left'],
};

describe('full table seating', () => {
  it('assigns every count from 2 to 8 to a fixed edge', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      const seats = seatAnchorsFor(count);
      expect(seats.map((seat) => seat.edge)).toEqual(EDGES[count]);
      for (const seat of seats) {
        expect(fanEdge(seat.x, seat.y)).toBe(seat.edge);
      }
      expect(seats[0]?.edge).toBe('bottom');
      const tops = seats.filter((seat) => seat.edge === 'top');
      if (count === 3) {
        expect(tops).toHaveLength(0);
      }
      if (count >= 4) {
        expect(tops.length).toBeGreaterThan(0);
      }
      if (count === 8) {
        expect(seats.filter((seat) => seat.edge === 'left')).toHaveLength(2);
        expect(seats.filter((seat) => seat.edge === 'right')).toHaveLength(2);
        expect(tops).toHaveLength(3);
      }
    }
  });

  it('keeps fans, names, and bets off each other and off the table chrome', () => {
    const problems: string[] = [];
    const name = 'Catherine';
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      const seats = seatAnchorsFor(count);
      for (const cards of [2, 4, 5, 13]) {
        const owned: { seat: number; box: CardRect; kind: string }[] = [];
        seats.forEach((seat, index) => {
          if (seat.edge === 'bottom') {
            return;
          }
          const slots = seatFan(seat.x, seat.y, cards, name);
          expect(slots).toHaveLength(cards);
          const plateAt = opponentNameAnchor(seat.x, seat.y, name);
          const chips = fanGapLine(seat.x, seat.y, name, '1000', 0);
          const bet = fanGapLine(seat.x, seat.y, name, 'Bet 200', 1);
          const texts: { kind: string; box: CardRect }[] = [
            {
              kind: 'name',
              box: {
                x: plateAt.x,
                y: plateAt.y,
                w: seatPlateWidth(name),
                h: 20,
              },
            },
            {
              kind: 'chips',
              box: { x: chips.x, y: chips.y, w: 32, h: 8 },
            },
            {
              kind: 'bet',
              box: { x: bet.x, y: bet.y, w: 56, h: 8 },
            },
          ];
          for (const text of texts) {
            owned.push({ seat: index, box: text.box, kind: text.kind });
          }
          slots.forEach((slot, card) => {
            const box = fanCardRect(slot);
            owned.push({ seat: index, box, kind: `card${card}` });
            for (const text of texts) {
              if (overlaps(box, text.box)) {
                problems.push(
                  `${count}p ${cards} ${seat.edge} ${text.kind} hits card ${card}`,
                );
              }
            }
            if (seat.edge === 'top') {
              const bottom = fanCardBottom(slot);
              if (slot.y <= bottom.y) {
                problems.push(`${count}p top fan does not open downward`);
              }
            }
          });
          if (cards === 4) {
            const along = slots.map((slot) =>
              seat.edge === 'top' ? slot.x : slot.y,
            );
            for (let step = 1; step < along.length; step += 1) {
              const prev = along[step - 1] ?? 0;
              const next = along[step] ?? 0;
              if (next - prev < 6) {
                problems.push(
                  `${count}p ${seat.edge} 4-card arc is stacked (${prev} to ${next})`,
                );
              }
            }
            const rotations = slots.map((slot) => slot.rotation);
            const spread = Math.max(...rotations) - Math.min(...rotations);
            if (spread < 0.2) {
              problems.push(`${count}p ${seat.edge} 4-card arc has no tilt`);
            }
          }
        });
        for (let a = 0; a < owned.length; a += 1) {
          for (let b = a + 1; b < owned.length; b += 1) {
            const left = owned[a];
            const right = owned[b];
            if (!left || !right || left.seat === right.seat) {
              continue;
            }
            if (overlaps(left.box, right.box)) {
              problems.push(
                `${count}p ${cards} seat ${left.seat} ${left.kind} hits seat ${right.seat} ${right.kind}`,
              );
            }
          }
        }
        for (const item of owned) {
          for (const block of CHROME) {
            if (overlaps(item.box, block.box)) {
              problems.push(
                `${count}p ${cards} seat ${item.seat} ${item.kind} hits ${block.name}`,
              );
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('draws top fans at the same card size as side fans', () => {
    const seats = seatAnchorsFor(4);
    const top = seats.find((seat) => seat.edge === 'top');
    const right = seats.find((seat) => seat.edge === 'right');
    const left = seats.find((seat) => seat.edge === 'left');
    expect(top).toBeDefined();
    expect(right).toBeDefined();
    expect(left).toBeDefined();
    if (!top || !right || !left) {
      return;
    }
    for (const cards of [2, 4]) {
      const topScale = seatFan(top.x, top.y, cards, 'Ada')[0]?.scale;
      const rightScale = seatFan(right.x, right.y, cards, 'Ada')[0]?.scale;
      const leftScale = seatFan(left.x, left.y, cards, 'Ada')[0]?.scale;
      expect(topScale).toBe(rightScale);
      expect(leftScale).toBe(rightScale);
      expect(topScale).toBeGreaterThan(0);
    }
  });

  it('draws a smaller card when the edge is shared and the hand is longer', () => {
    const headsUp = seatAnchorsFor(2)[1];
    const full = seatAnchorsFor(8).find(
      (seat) => seat.edge === 'top' && seat.edgeIndex === 1,
    );
    expect(headsUp).toBeDefined();
    expect(full).toBeDefined();
    if (!headsUp || !full) {
      return;
    }
    const roomy = seatFan(headsUp.x, headsUp.y, 2, 'Ada')[0];
    const tight = seatFan(full.x, full.y, 4, 'Ada')[0];
    expect(roomy?.scale).toBeGreaterThan(tight?.scale ?? 1);
  });
});
