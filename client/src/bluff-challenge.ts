import type { BluffState } from '../../src/shared/games/bluff';
import { pileFaceUp, pilePositions, PILE_X, PILE_Y } from './bluff-layout';

/** The line is up, and the pile is still in the center. */
export const CHALLENGE_MESSAGE_MS = 280;
/** Cards travel from the center into the hand. */
export const CHALLENGE_MOVE_MS = 220;
/** The new cards stay raised, then drop on their own. */
export const CHALLENGE_LIFT_MS = 260;

export type ChallengePhase = 'message' | 'added' | 'settled';

export interface ChallengeFrame {
  phase: ChallengePhase;
  /** False while those cards are still on the pile. */
  cardsInHand: boolean;
  /** True only while the new cards are raised. */
  lifted: boolean;
}

export interface ChallengePickup {
  line: string;
  cards: string[];
  seat: number;
  challenger: number;
  accused: number;
}

/**
 * `Ada challenged you` when this seat was challenged.
 * `You challenged Ada` when this seat made the call.
 */
export function challengeLine(
  challenger: number,
  accused: number,
  viewer: number | null,
  seatName: (seatIndex: number) => string,
): string {
  const who = named(seatName(challenger), challenger);
  const them = named(seatName(accused), accused);
  if (viewer === accused) {
    return `${who} challenged you`;
  }
  if (viewer === challenger) {
    return `You challenged ${them}`;
  }
  return `${who} challenged ${them}`;
}

function named(name: string, seatIndex: number): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return `Seat ${seatIndex}`;
  }
  return trimmed;
}

/**
 * The pile moved into one hand. That is a challenge.
 * A pass that sets the pile aside adds those cards to nobody.
 */
export function challengePickup(
  before: BluffState,
  after: BluffState,
  viewer: number | null,
  seatName: (seatIndex: number) => string,
): ChallengePickup | null {
  if (before.lastPlay === null || before.discardPile.length === 0) {
    return null;
  }
  if (after.discardPile.length > 0) {
    return null;
  }
  const pile = new Set(before.discardPile);
  let found: { seat: number; cards: string[] } | null = null;
  for (const key of Object.keys(after.hands)) {
    const previous = new Set(before.hands[key] ?? []);
    const added: string[] = [];
    for (const card of before.discardPile) {
      const hand = after.hands[key] ?? [];
      if (pile.has(card) && hand.includes(card) && !previous.has(card)) {
        added.push(card);
      }
    }
    if (added.length === 0) {
      continue;
    }
    if (found) {
      return null;
    }
    found = { seat: Number(key), cards: added };
  }
  if (!found) {
    return null;
  }
  const accused = before.lastPlay.seat;
  const challenger = found.seat === accused ? after.turnSeatIndex : found.seat;
  if (challenger === null) {
    return null;
  }
  return {
    line: challengeLine(challenger, accused, viewer, seatName),
    cards: found.cards,
    seat: found.seat,
    challenger,
    accused,
  };
}

/**
 * Message first, then the cards are in the hand and raised, then they sit down.
 * The drop does not wait for a click.
 */
export function challengeFrame(elapsedMs: number): ChallengeFrame {
  if (elapsedMs < CHALLENGE_MESSAGE_MS) {
    return { phase: 'message', cardsInHand: false, lifted: false };
  }
  if (
    elapsedMs <
    CHALLENGE_MESSAGE_MS + CHALLENGE_MOVE_MS + CHALLENGE_LIFT_MS
  ) {
    return { phase: 'added', cardsInHand: true, lifted: true };
  }
  return { phase: 'settled', cardsInHand: true, lifted: false };
}

export interface PileAnchor {
  x: number;
  y: number;
  faceUp: boolean;
}

/** Where each pile card was drawn before the challenge moved it. */
export function pileAnchors(
  before: BluffState,
  viewer: number | null,
): Map<string, PileAnchor> {
  const slots = pilePositions(before.discardPile.length);
  const start = before.discardPile.length - slots.length;
  const anchors = new Map<string, PileAnchor>();
  for (let index = 0; index < before.discardPile.length; index += 1) {
    const cardId = before.discardPile[index];
    if (!cardId) {
      continue;
    }
    const shown = index - start;
    const slot = shown >= 0 ? slots[shown] : undefined;
    anchors.set(cardId, {
      x: slot?.x ?? PILE_X,
      y: slot?.y ?? PILE_Y,
      faceUp: pileFaceUp(before, cardId, viewer),
    });
  }
  return anchors;
}
