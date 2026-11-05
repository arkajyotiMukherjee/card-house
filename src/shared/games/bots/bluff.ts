import {
  BLUFF_GAME_TYPE,
  BLUFF_RANKS,
  BLUFF_TRUE_PER_RANK,
  type BluffIntent,
  type BluffRank,
  type BluffState,
  cardIsTrue,
  isJoker,
  rankOfCard,
} from '../bluff.ts';
import { byLowestCard, lowestCard } from './order.ts';
import type { BotStrategy } from './types.ts';

function handOf(state: BluffState, seatIndex: number): string[] {
  return state.hands[String(seatIndex)] ?? [];
}

function playsSoFar(state: BluffState, seatIndex: number): number {
  return state.playCounts[String(seatIndex)] ?? 0;
}

/** Plays 1, 5, 9, … of this hand are lies. The plays between them are true. */
function wantsLie(state: BluffState, seatIndex: number): boolean {
  return playsSoFar(state, seatIndex) % 4 === 0;
}

function realCards(hand: readonly string[]): string[] {
  return hand.filter((card) => !isJoker(card)).sort(byLowestCard);
}

function matchingCards(hand: readonly string[], rank: BluffRank): string[] {
  return hand.filter((card) => rankOfCard(card) === rank).sort(byLowestCard);
}

function lyingCards(hand: readonly string[], rank: BluffRank): string[] {
  return hand.filter((card) => !cardIsTrue(card, rank)).sort(byLowestCard);
}

function otherRank(rank: BluffRank): BluffRank {
  for (const candidate of BLUFF_RANKS) {
    if (candidate !== rank) {
      return candidate;
    }
  }
  return 'A';
}

function playCard(card: string, claimRank?: BluffRank): BluffIntent {
  if (claimRank === undefined) {
    return { type: 'play', cards: [card] };
  }
  return { type: 'play', cards: [card], claimRank };
}

/** Challenge on the 4th, 8th, 12th, … turn this seat takes. */
export const BLUFF_CHALLENGE_EVERY = 4;

function turnsSoFar(state: BluffState, seatIndex: number): number {
  return state.turnCounts[String(seatIndex)] ?? 0;
}

function wantsChallenge(state: BluffState, seatIndex: number): boolean {
  return (
    turnsSoFar(state, seatIndex) % BLUFF_CHALLENGE_EVERY ===
    BLUFF_CHALLENGE_EVERY - 1
  );
}

/**
 * The claim cannot be true when it asks for more cards of that rank than the
 * deck still allows. Four of the rank and both jokers are the honest maximum,
 * minus the true cards already in this hand.
 */
function claimCannotBeTrue(state: BluffState, seatIndex: number): boolean {
  const last = state.lastPlay;
  if (last === null || last.seat === seatIndex) {
    return false;
  }
  const hand = handOf(state, seatIndex);
  let held = 0;
  for (const card of hand) {
    if (cardIsTrue(card, last.claimRank)) {
      held += 1;
    }
  }
  return last.cards.length > BLUFF_TRUE_PER_RANK - held;
}

function canChallenge(state: BluffState, seatIndex: number): boolean {
  const last = state.lastPlay;
  return last !== null && last.seat !== seatIndex;
}

function leadPlay(hand: readonly string[], lie: boolean): BluffIntent {
  const real = realCards(hand);
  const card = real[0] ?? lowestCard(hand.slice());
  const rank = rankOfCard(card);
  if (lie && rank !== null) {
    return playCard(card, otherRank(rank));
  }
  return playCard(card, rank ?? 'A');
}

function followPlay(
  hand: readonly string[],
  rank: BluffRank,
  lie: boolean,
): BluffIntent {
  const truths = matchingCards(hand, rank);
  const lies = lyingCards(hand, rank);
  const jokers = hand.filter((card) => isJoker(card)).sort(byLowestCard);
  if (lie) {
    if (lies.length > 0) {
      return playCard(lies[0]);
    }
    if (truths.length > 0) {
      return playCard(truths[0]);
    }
    return playCard(lowestCard(jokers));
  }
  if (truths.length > 0) {
    return playCard(truths[0]);
  }
  if (jokers.length > 0) {
    return playCard(lowestCard(jokers));
  }
  // A cautious turn with no honest card sits out. Always inventing a lie
  // here kept two bots recycling the same pile indefinitely on some deals.
  return { type: 'pass' };
}

export const bluffStrategy: BotStrategy<BluffState, BluffIntent> = {
  gameType: BLUFF_GAME_TYPE,
  actingSeats(state) {
    if (state.phase !== 'play' || state.turnSeatIndex === null) {
      return [];
    }
    return [state.turnSeatIndex];
  },
  choose(state, seatIndex) {
    if (
      canChallenge(state, seatIndex) &&
      (claimCannotBeTrue(state, seatIndex) || wantsChallenge(state, seatIndex))
    ) {
      return { type: 'challenge' };
    }
    const hand = handOf(state, seatIndex);
    if (hand.length === 0) {
      return { type: 'pass' };
    }
    const lie = wantsLie(state, seatIndex);
    if (state.requiredRank === null) {
      return leadPlay(hand, lie);
    }
    return followPlay(hand, state.requiredRank, lie);
  },
};
