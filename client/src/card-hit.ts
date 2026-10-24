/**
 * Which local-hand card a click lands on.
 *
 * The hand is a fan, so neighbors share pixels. Excalibur reports every
 * collider under the pointer. The drawn card in front is the only one
 * that toggles. Later entries are drawn in front. A raised card is in
 * front of the cards it overlaps, including ones drawn after it.
 */

export interface CardHitBox {
  id: string;
  /** Left edge of the drawn card. */
  x: number;
  /** Top edge of the drawn card. A raised card sits this much higher. */
  y: number;
  width: number;
  height: number;
  /**
   * Pixels the art is lifted. Zero is a card at rest. A higher lift is
   * in front of a lower one where the rectangles overlap.
   */
  lift: number;
}

export interface CardPoint {
  x: number;
  y: number;
}

interface PlacedCard {
  actor: {
    pos: { readonly x: number; readonly y: number };
    graphics: { readonly offset: { readonly y: number } };
  };
}

/** Hit box for a card centered on `(centerX, centerY)`. `lift` shifts it up. */
export function cardHitBox(
  id: string,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  lift: number,
): CardHitBox {
  const raised = lift > 0 ? lift : 0;
  return {
    id,
    x: centerX - width / 2,
    y: centerY - height / 2 - raised,
    width,
    height,
    lift: raised,
  };
}

/**
 * Hit boxes for `ids` in draw order. `cards` supplies the actor that is
 * on screen now, including the graphic offset from `placeCardLift`.
 */
export function localHandHitBoxes<T extends PlacedCard>(
  ids: readonly string[],
  cards: ReadonlyMap<string, T>,
  size: number,
): CardHitBox[] {
  const boxes: CardHitBox[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!id) {
      continue;
    }
    const record = cards.get(id);
    if (!record) {
      continue;
    }
    const lift = Math.max(0, -record.actor.graphics.offset.y);
    boxes.push(
      cardHitBox(id, record.actor.pos.x, record.actor.pos.y, size, size, lift),
    );
  }
  return boxes;
}

function contains(box: CardHitBox, point: CardPoint): boolean {
  return (
    point.x >= box.x &&
    point.x < box.x + box.width &&
    point.y >= box.y &&
    point.y < box.y + box.height
  );
}

/**
 * The card visually in front under `point`, or null when the point
 * misses every card. `cards` is draw order, later last.
 */
export function frontCardAt(
  cards: readonly CardHitBox[],
  point: CardPoint,
): string | null {
  let best: CardHitBox | null = null;
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (!card || !contains(card, point)) {
      continue;
    }
    if (!best || card.lift >= best.lift) {
      best = card;
    }
  }
  return best?.id ?? null;
}

/**
 * True when this pointer should toggle `cardId`.
 * A card that is not in the local hand (a pile or a meld) is left alone.
 */
export function isFrontHandCard(
  cardId: string,
  x: number,
  y: number,
  hand: readonly CardHitBox[],
): boolean {
  let listed = false;
  for (let index = 0; index < hand.length; index += 1) {
    if (hand[index]?.id === cardId) {
      listed = true;
      break;
    }
  }
  if (!listed) {
    return true;
  }
  return frontCardAt(hand, { x, y }) === cardId;
}

/**
 * Toggle only the front card under `point`. A miss returns the same
 * selection. Neighbors that share the point stay as they were.
 */
export function toggleFrontCard(
  selected: ReadonlySet<string>,
  cards: readonly CardHitBox[],
  point: CardPoint,
): Set<string> {
  const next = new Set(selected);
  const id = frontCardAt(cards, point);
  if (id === null) {
    return next;
  }
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
