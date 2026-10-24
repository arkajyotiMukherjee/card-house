import { describe, expect, it } from 'vitest';
import {
  type CardHitBox,
  cardHitBox,
  frontCardAt,
  isFrontHandCard,
  toggleFrontCard,
} from './card-hit';

function holds(box: CardHitBox, x: number, y: number): boolean {
  return (
    x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height
  );
}

describe('front card under the pointer', () => {
  it('chooses only the later card where two rectangles overlap', () => {
    const cards = [
      { id: 'back', x: 0, y: 0, width: 64, height: 64, lift: 0 },
      { id: 'front', x: 32, y: 0, width: 64, height: 64, lift: 0 },
    ];
    const overlap = { x: 40, y: 16 };
    expect(holds(cards[0]!, overlap.x, overlap.y)).toBe(true);
    expect(holds(cards[1]!, overlap.x, overlap.y)).toBe(true);
    expect(frontCardAt(cards, overlap)).toBe('front');

    const selected = toggleFrontCard(new Set<string>(), cards, overlap);
    expect([...selected]).toEqual(['front']);
    const cleared = toggleFrontCard(selected, cards, overlap);
    expect(cleared.has('front')).toBe(false);
    expect(cleared.has('back')).toBe(false);

    expect(frontCardAt(cards, { x: 8, y: 16 })).toBe('back');
    expect(frontCardAt(cards, { x: 120, y: 16 })).toBeNull();
    expect(
      toggleFrontCard(new Set(['front']), cards, { x: 120, y: 16 }),
    ).toEqual(new Set(['front']));
  });

  it('deselecting a raised queen leaves the ten and the two unselected', () => {
    const ten = cardHitBox('10S', 32, 52, 64, 64, 0);
    const queen = cardHitBox('QH', 56, 52, 64, 64, 20);
    const two = cardHitBox('2H', 80, 52, 64, 64, 0);
    const cards = [ten, queen, two];
    const onQueen = { x: 50, y: 30 };
    expect(holds(ten, onQueen.x, onQueen.y)).toBe(true);
    expect(holds(queen, onQueen.x, onQueen.y)).toBe(true);
    expect(holds(two, onQueen.x, onQueen.y)).toBe(true);
    expect(queen.lift).toBeGreaterThan(ten.lift);
    expect(queen.lift).toBeGreaterThan(two.lift);
    expect(frontCardAt(cards, onQueen)).toBe('QH');

    const next = toggleFrontCard(new Set(['QH']), cards, onQueen);
    expect(next.has('QH')).toBe(false);
    expect(next.has('10S')).toBe(false);
    expect(next.has('2H')).toBe(false);
  });

  it('ignores a local-hand card that is behind another card', () => {
    const cards = [
      { id: '10S', x: 0, y: 0, width: 64, height: 64, lift: 0 },
      { id: 'QH', x: 24, y: -20, width: 64, height: 64, lift: 20 },
    ];
    expect(isFrontHandCard('QH', 40, 10, cards)).toBe(true);
    expect(isFrontHandCard('10S', 40, 10, cards)).toBe(false);
    expect(isFrontHandCard('pile', 40, 10, cards)).toBe(true);
  });
});
