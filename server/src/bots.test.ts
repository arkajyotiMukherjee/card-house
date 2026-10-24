import { blackjackRules } from '../../src/shared/games/blackjack.ts';
import {
  bluffRules,
  cardIsTrue,
  rankOfCard,
  type BluffIntent,
  type BluffState,
} from '../../src/shared/games/bluff.ts';
import { bluffStrategy } from '../../src/shared/games/bots/bluff.ts';
import {
  crazyEightsRules,
  type CrazyEightsIntent,
  type CrazyEightsState,
} from '../../src/shared/games/crazy-eights.ts';
import { goFishRules } from '../../src/shared/games/go-fish.ts';
import { heartsRules } from '../../src/shared/games/hearts.ts';
import {
  pokerRules,
  type PokerVariation,
} from '../../src/shared/games/poker.ts';
import { presidentRules } from '../../src/shared/games/president.ts';
import { rummyRules } from '../../src/shared/games/rummy.ts';
import { spadesRules } from '../../src/shared/games/spades.ts';
import { strategyFor } from '../../src/shared/games/bots/registry.ts';
import type {
  GameSeat,
  GameTable,
  IntentContext,
} from '../../src/shared/games/game-rules.ts';
import { playBotTurns } from './bot-runner.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

interface LooseRules {
  initialState(players: GameSeat[], table: GameTable): unknown;
  applyIntent(prev: unknown, intent: unknown, ctx: IntentContext): unknown;
}

function seat(seatIndex: number): GameSeat {
  return {
    id: `seat-${seatIndex}`,
    tableId: 'table-1',
    lobbyMemberId: `member-${seatIndex}`,
    seatIndex,
    chips: null,
    joinedAt: 1,
    seatState: 'active',
  };
}

function table(gameType: string, stateJson = '{}'): GameTable {
  return {
    id: 'table-1',
    lobbyId: 'lobby-1',
    gameType,
    name: gameType,
    status: 'waiting_for_players',
    minPlayers: 2,
    maxPlayers: 8,
    stateJson,
    createdAt: 1,
  };
}

function seats(count: number): GameSeat[] {
  const rows: GameSeat[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push(seat(index));
  }
  return rows;
}

function phaseOf(state: unknown): string {
  if (!state || typeof state !== 'object' || !('phase' in state)) {
    return '';
  }
  const phase = state.phase;
  return typeof phase === 'string' ? phase : '';
}

function handNumberOf(state: unknown): number {
  if (!state || typeof state !== 'object' || !('handNumber' in state)) {
    return 0;
  }
  const handNumber = state.handNumber;
  return typeof handNumber === 'number' ? handNumber : 0;
}

/**
 * Spades ends at 500. This policy bids every spade plus side aces and kings,
 * then plays low, so both sides undertrick and the match stays below 500.
 * A scored hand is that game's finish: the hand number moves on.
 */
function spadesHandScored(state: unknown): boolean {
  return phaseOf(state) === 'finished' || handNumberOf(state) >= 2;
}

function runBots(
  gameType: string,
  rules: LooseRules,
  count: number,
  stateJson = '{}',
  done: (state: unknown) => boolean = (state) => phaseOf(state) === 'finished',
): { state: unknown; intents: unknown[] } {
  const players = seats(count);
  let state = rules.initialState(players, table(gameType, stateJson));
  const actors = players.map((row) => ({
    seatIndex: row.seatIndex,
    isBot: true,
  }));
  const intents: unknown[] = [];
  for (let guard = 0; guard < 20000; guard += 1) {
    const batch = playBotTurns(
      gameType,
      state,
      actors,
      (current, intent, seatIndex) => {
        const who = players.find((row) => row.seatIndex === seatIndex);
        if (!who) {
          throw new Error(`${gameType} missing seat ${seatIndex}`);
        }
        return rules.applyIntent(current, intent, { seat: who, now: 1 });
      },
    );
    if (batch.error) {
      throw new Error(`${gameType}: ${batch.error}`);
    }
    for (const applied of batch.applied) {
      intents.push(applied.intent);
    }
    state = batch.state;
    if (done(state)) {
      return { state, intents };
    }
    if (!batch.pending) {
      const acting = strategyFor(gameType)?.actingSeats(state) ?? [];
      assert(
        acting.length === 0,
        `${gameType} stopped while seats ${acting.join(',')} still act`,
      );
      return { state, intents };
    }
  }
  throw new Error(`${gameType} did not finish`);
}

function openingIntent(
  gameType: string,
  rules: LooseRules,
  count: number,
  stateJson = '{}',
): unknown {
  const players = seats(count);
  const state = rules.initialState(players, table(gameType, stateJson));
  const strategy = strategyFor(gameType);
  assert(strategy !== undefined, `${gameType} has a strategy`);
  const acting = strategy.actingSeats(state);
  const seatIndex = acting[0];
  assert(seatIndex !== undefined, `${gameType} opening has an actor`);
  const intent = strategy.choose(state, seatIndex);
  const who = players.find((row) => row.seatIndex === seatIndex);
  assert(who !== undefined, `${gameType} opening seat exists`);
  rules.applyIntent(state, intent, { seat: who, now: 1 });
  return intent;
}

function loose(rules: object): LooseRules {
  return rules as LooseRules;
}

const games: ReadonlyArray<{
  gameType: string;
  rules: LooseRules;
  seats: number;
  stateJson?: string;
}> = [
  { gameType: 'bluff', rules: loose(bluffRules), seats: 2 },
  { gameType: 'president', rules: loose(presidentRules), seats: 3 },
  { gameType: 'go_fish', rules: loose(goFishRules), seats: 2 },
  { gameType: 'crazy_eights', rules: loose(crazyEightsRules), seats: 2 },
  { gameType: 'rummy', rules: loose(rummyRules), seats: 2 },
  { gameType: 'blackjack', rules: loose(blackjackRules), seats: 2 },
  { gameType: 'spades', rules: loose(spadesRules), seats: 4 },
  { gameType: 'hearts', rules: loose(heartsRules), seats: 4 },
];

for (const game of games) {
  const intent = openingIntent(game.gameType, game.rules, game.seats);
  assert(intent !== undefined, `${game.gameType} opening intent`);
  const finished = game.gameType === 'spades' ? spadesHandScored : undefined;
  const done = runBots(game.gameType, game.rules, game.seats, '{}', finished);
  if (game.gameType === 'spades') {
    assert(
      spadesHandScored(done.state),
      'spades bots scored a hand without a rejected intent',
    );
  } else {
    assert(
      phaseOf(done.state) === 'finished',
      `${game.gameType} bot hand finished, saw ${phaseOf(done.state)}`,
    );
  }
}

for (const variation of ['holdem', 'omaha', 'oklahoma'] as const) {
  const stateJson = JSON.stringify({ variation });
  const intent = openingIntent('poker', loose(pokerRules), 2, stateJson);
  assert(intent !== undefined, `${variation} opening intent`);
  const done = runBots('poker', loose(pokerRules), 2, stateJson);
  assert(
    phaseOf(done.state) === 'finished',
    `${variation} bot hand finished, saw ${phaseOf(done.state)}`,
  );
  if (variation === 'oklahoma') {
    assert(
      done.intents.some(
        (intent) =>
          !!intent &&
          typeof intent === 'object' &&
          'type' in intent &&
          intent.type === 'discard',
      ),
      'oklahoma bots discard',
    );
  }
}

const crazy: CrazyEightsState = {
  phase: 'play',
  hands: { '0': ['5H', '8C', 'QH'], '1': ['AD', '2C'] },
  stock: ['9D', '3C', '4S'],
  discardPile: ['5S'],
  currentSuit: 'S',
  turnSeatIndex: 0,
  winnerSeatIndex: null,
  scores: {},
  passes: 0,
};
const crazyStrategy = strategyFor('crazy_eights');
assert(crazyStrategy !== undefined, 'crazy eights strategy');
const crazyIntent = crazyStrategy.choose(crazy, 0);
assert(
  JSON.stringify(crazyIntent) === JSON.stringify({ type: 'play', card: '5H' }),
  'crazy eights plays the lowest legal card',
);
crazyEightsRules.applyIntent(crazy, crazyIntent as CrazyEightsIntent, {
  seat: seat(0),
  now: 1,
});

const eight: CrazyEightsState = {
  ...crazy,
  hands: { '0': ['8C', '2H', '2D'], '1': ['AD'] },
  discardPile: ['KS'],
  currentSuit: 'S',
};
const eightIntent = crazyStrategy.choose(eight, 0);
assert(
  JSON.stringify(eightIntent) ===
    JSON.stringify({ type: 'play', card: '8C', suit: 'H' }),
  'an eight names the suit held most',
);
crazyEightsRules.applyIntent(eight, eightIntent as CrazyEightsIntent, {
  seat: seat(0),
  now: 1,
});

const bet = openingIntent('blackjack', loose(blackjackRules), 2);
assert(
  JSON.stringify(bet) === JSON.stringify({ type: 'bet', amount: 10 }),
  'blackjack bets 10',
);

function pokerVariation(state: unknown): PokerVariation | undefined {
  if (!state || typeof state !== 'object' || !('variation' in state)) {
    return undefined;
  }
  const variation = state.variation;
  return variation === 'holdem' ||
    variation === 'omaha' ||
    variation === 'oklahoma'
    ? variation
    : undefined;
}

const holdem = pokerRules.initialState(
  seats(2),
  table('poker', JSON.stringify({ variation: 'holdem' })),
);
assert(pokerVariation(holdem) === 'holdem', 'holdem fixture');

const stopped = playBotTurns(
  'crazy_eights',
  crazy,
  [
    { seatIndex: 0, isBot: false },
    { seatIndex: 1, isBot: true },
  ],
  () => {
    throw new Error('a person acts next');
  },
);
assert(stopped.applied.length === 0, 'bots wait for the person');
assert(stopped.pending === false, 'waiting is not a scheduled leftover');
assert(stopped.error === undefined, 'waiting is not an error');

function bluffPlaying(overrides: Partial<BluffState>): BluffState {
  return {
    phase: 'play',
    hands: {},
    discardPile: [],
    requiredRank: null,
    passed: [],
    playCounts: {},
    turnSeatIndex: 0,
    lastPlay: null,
    winnerSeatIndex: null,
    ...overrides,
  };
}

function sameChoice(state: BluffState, seatIndex = 0): unknown {
  const first = bluffStrategy.choose(state, seatIndex);
  const second = bluffStrategy.choose(state, seatIndex);
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    'the same Bluff state chooses the same cards',
  );
  return first;
}

function asPlay(intent: unknown): BluffIntent & { type: 'play' } {
  if (
    !intent ||
    typeof intent !== 'object' ||
    !('type' in intent) ||
    intent.type !== 'play' ||
    !('cards' in intent) ||
    !Array.isArray(intent.cards) ||
    intent.cards.length !== 1 ||
    typeof intent.cards[0] !== 'string'
  ) {
    throw new Error('the Bluff bot plays one card');
  }
  return intent as BluffIntent & { type: 'play' };
}

function playedCard(intent: unknown): string {
  const card = asPlay(intent).cards[0];
  if (card === undefined) {
    throw new Error('the Bluff bot plays one card');
  }
  return card;
}

const followHand = ['2C', '4D', 'KS', '4H'];
for (const [count, card, truthful] of [
  [0, '2C', false],
  [1, '4D', true],
  [2, '4D', true],
  [3, '4D', true],
  [4, '2C', false],
  [8, '2C', false],
] as const) {
  const state = bluffPlaying({
    hands: { '0': followHand, '1': ['KH'] },
    requiredRank: '4',
    playCounts: { '0': count, '1': 99 },
    turnSeatIndex: 0,
  });
  const intent = sameChoice(state);
  const cardId = playedCard(intent);
  assert(cardId === card, `play ${count + 1} chooses ${card}, saw ${cardId}`);
  assert(
    cardIsTrue(cardId, '4') === truthful,
    `play ${count + 1} ${truthful ? 'tells the truth' : 'lies'}`,
  );
  bluffRules.applyIntent(state, asPlay(intent), {
    seat: seat(0),
    now: 1,
  });
}

const onlyTruth = bluffPlaying({
  hands: { '0': ['4S', '4H'], '1': ['KH'] },
  requiredRank: '4',
  playCounts: { '0': 0 },
  turnSeatIndex: 0,
});
const truthFallback = playedCard(sameChoice(onlyTruth));
assert(
  cardIsTrue(truthFallback, '4'),
  'a lie falls back to one card of the called rank',
);

const onlyLie = bluffPlaying({
  hands: { '0': ['KS', '2C'], '1': ['KH'] },
  requiredRank: '4',
  playCounts: { '0': 1 },
  turnSeatIndex: 0,
});
const lieFallback = playedCard(sameChoice(onlyLie));
assert(
  !cardIsTrue(lieFallback, '4'),
  'the truth falls back to a card of another rank',
);
assert(lieFallback === '2C', 'the fallback lie is the same low card');

const jokersOnly = bluffPlaying({
  hands: { '0': ['JR', 'JB'], '1': ['KH'] },
  requiredRank: 'Q',
  playCounts: { '0': 0 },
  turnSeatIndex: 0,
});
const jokerPlay = playedCard(sameChoice(jokersOnly));
assert(jokerPlay === 'JB', 'a joker-only hand plays the same joker');
assert(cardIsTrue(jokerPlay, 'Q'), 'a joker is a true card, not a queen');

const leadLie = bluffPlaying({
  hands: { '0': ['4H', '2C'], '1': ['KH'] },
  requiredRank: null,
  playCounts: { '0': 0 },
  turnSeatIndex: 0,
});
const leadLieIntent = asPlay(sameChoice(leadLie));
const leadLieCard = playedCard(leadLieIntent);
assert(
  leadLieIntent.claimRank === 'A' &&
    leadLieCard === '2C' &&
    rankOfCard(leadLieCard) !== 'A',
  'the first lead play calls a rank the card is not',
);
bluffRules.applyIntent(leadLie, leadLieIntent, {
  seat: seat(0),
  now: 1,
});

const leadTruth = bluffPlaying({
  ...leadLie,
  playCounts: { '0': 1 },
});
const leadTruthIntent = asPlay(sameChoice(leadTruth));
const leadTruthCard = playedCard(leadTruthIntent);
assert(
  leadTruthIntent.claimRank === '2' && leadTruthCard === '2C',
  'the next lead play calls the card rank',
);

const emptyHand = bluffPlaying({
  hands: { '0': [], '1': ['KH'] },
  requiredRank: 'A',
  turnSeatIndex: 0,
  lastPlay: { seat: 1, cards: ['KH'], claimRank: 'A' },
});
assert(
  JSON.stringify(sameChoice(emptyHand)) === JSON.stringify({ type: 'pass' }),
  'an empty hand passes so the last card can stand',
);
