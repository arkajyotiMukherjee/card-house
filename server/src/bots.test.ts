import { blackjackRules } from '../../src/shared/games/blackjack.ts';
import {
  bluffRules,
  cardIsTrue,
  rankOfCard,
  type BluffIntent,
  type BluffState,
} from '../../src/shared/games/bluff.ts';
import {
  BLUFF_CHALLENGE_EVERY,
  bluffStrategy,
} from '../../src/shared/games/bots/bluff.ts';
import {
  crazyEightsRules,
  type CrazyEightsIntent,
  type CrazyEightsState,
} from '../../src/shared/games/crazy-eights.ts';
import { goFishRules } from '../../src/shared/games/go-fish.ts';
import { heartsRules } from '../../src/shared/games/hearts.ts';
import {
  pokerRules,
  type PokerIntent,
  type PokerState,
  type PokerVariation,
} from '../../src/shared/games/poker.ts';
import { presidentRules } from '../../src/shared/games/president.ts';
import { rummyRules } from '../../src/shared/games/rummy.ts';
import { spadesRules } from '../../src/shared/games/spades.ts';
import { pokerStrategy } from '../../src/shared/games/bots/poker.ts';
import { strategyFor } from '../../src/shared/games/bots/registry.ts';
import type {
  GameSeat,
  GameTable,
  IntentContext,
} from '../../src/shared/games/game-rules.ts';
import {
  BOT_BEAT_MICROS,
  POKER_HAND_PAUSE_MICROS,
  botIsNext,
  playBotTurns,
  tableBeatDelay,
} from './bot-runner.ts';

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

const bluffPlayers = seats(2);
const bluffOpening = bluffRules.initialState(bluffPlayers, table('bluff'));
const bothBots = bluffPlayers.map((row) => ({
  seatIndex: row.seatIndex,
  isBot: true,
}));
const humanLead = [
  { seatIndex: 0, isBot: false },
  { seatIndex: 1, isBot: true },
];
function applyBluff(
  current: unknown,
  intent: unknown,
  seatIndex: number,
): unknown {
  const who = bluffPlayers.find((row) => row.seatIndex === seatIndex);
  if (!who) {
    throw new Error(`bluff missing seat ${seatIndex}`);
  }
  return bluffRules.applyIntent(current as BluffState, intent as BluffIntent, {
    seat: who,
    now: 1,
  });
}
assert(
  botIsNext('bluff', bluffOpening, humanLead) === false,
  'a human lead is not a bot beat',
);
assert(BOT_BEAT_MICROS === 800_000n, 'bot beats are 800ms apart');
assert(
  tableBeatDelay('bot') === BOT_BEAT_MICROS,
  'a bot turn still waits 800ms',
);
assert(
  tableBeatDelay('street') === BOT_BEAT_MICROS,
  'a poker street still waits 800ms',
);
assert(
  POKER_HAND_PAUSE_MICROS === 10_000_000n,
  'a finished poker hand stays up for 10 seconds',
);
assert(
  tableBeatDelay('hand') === 10_000_000n,
  'the next hand is not dealt before 10 seconds',
);
assert(
  tableBeatDelay('hand') > BOT_BEAT_MICROS * 3n,
  'the hand pause is longer than the old three beats',
);
const oneBeat = playBotTurns('bluff', bluffOpening, bothBots, applyBluff, 1);
assert(oneBeat.applied.length === 1, 'one reducer publishes one bot play');
assert(oneBeat.pending === true, 'the next bot waits for the next beat');
assert(oneBeat.error === undefined, 'one beat is not an error');
const nextBeat = playBotTurns('bluff', oneBeat.state, bothBots, applyBluff, 1);
assert(nextBeat.applied.length === 1, 'the following beat is its own play');
assert(
  JSON.stringify(oneBeat.applied[0]?.intent) !==
    JSON.stringify(nextBeat.applied[0]?.intent) ||
    oneBeat.applied[0]?.seatIndex !== nextBeat.applied[0]?.seatIndex,
  'the second beat is not a repeat of the first',
);
const sameBeat = playBotTurns('bluff', bluffOpening, bothBots, applyBluff, 1);
assert(
  JSON.stringify(sameBeat.applied[0]?.intent) ===
    JSON.stringify(oneBeat.applied[0]?.intent),
  'the same state plays the same bot card',
);

const holdemPlayers = seats(2);
const holdemButton = holdemPlayers[0];
const holdemBlind = holdemPlayers[1];
assert(
  holdemButton !== undefined && holdemBlind !== undefined,
  'two poker seats',
);
const holdemOpening = pokerRules.initialState(
  holdemPlayers,
  table('poker', JSON.stringify({ variation: 'holdem' })),
);
const holdemFlop = pokerRules.applyIntent(
  pokerRules.applyIntent(
    holdemOpening,
    { type: 'call' },
    { seat: holdemButton, now: 1 },
  ),
  { type: 'check' },
  { seat: holdemBlind, now: 1 },
);
const pokerBeat = playBotTurns(
  'poker',
  holdemFlop,
  holdemPlayers.map((row) => ({ seatIndex: row.seatIndex, isBot: true })),
  (current, intent, seatIndex) => {
    const who = holdemPlayers.find((row) => row.seatIndex === seatIndex);
    if (!who) {
      throw new Error('poker missing seat');
    }
    return pokerRules.applyIntent(
      current as PokerState,
      intent as PokerIntent,
      {
        seat: who,
        now: 1,
      },
    );
  },
  1,
);
assert(pokerBeat.applied.length === 1, 'one poker beat publishes one action');
assert(
  pokerBeat.pending === true,
  'the next poker seat waits for the next beat',
);
assert(
  phaseOf(pokerBeat.state) === 'play',
  'one beat does not finish the flop',
);

for (const variation of ['holdem', 'omaha', 'oklahoma'] as const) {
  const stateJson = JSON.stringify({ variation });
  const intent = openingIntent('poker', loose(pokerRules), 2, stateJson);
  assert(intent !== undefined, `${variation} opening intent`);
  const done = runBots('poker', loose(pokerRules), 2, stateJson);
  assert(
    phaseOf(done.state) === 'finished',
    `${variation} bot hand finished, saw ${phaseOf(done.state)}`,
  );
  if (variation === 'holdem') {
    assert(
      done.intents.some(
        (intent) =>
          !!intent &&
          typeof intent === 'object' &&
          'type' in intent &&
          (intent.type === 'bet' || intent.type === 'raise'),
      ),
      'holdem bots bet or raise from a strong hand',
    );
  }
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

function pokerRow(
  chips: number,
  hole: string[],
  streetBet: number,
  folded = false,
): PokerState['seats'][string] {
  return {
    chips,
    hole,
    streetBet,
    committed: streetBet,
    folded,
    allIn: false,
    acted: folded,
    mustDiscard: false,
  };
}

function pokerSpot(overrides: Partial<PokerState> = {}): PokerState {
  return {
    phase: 'play',
    variation: 'holdem',
    street: 'preflop',
    step: 'bet',
    handNumber: 1,
    deck: [],
    board: [],
    seats: {},
    order: [0, 1, 2],
    dealerSeatIndex: 0,
    turnSeatIndex: 1,
    currentBet: 20,
    minRaise: 20,
    pot: 30,
    pots: [],
    winnerSeatIndexes: [],
    hands: {},
    end: null,
    smallBlind: 10,
    bigBlind: 20,
    limit: 'no-limit',
    ...overrides,
  };
}

const afterHumanFold = pokerSpot({
  seats: {
    '0': pokerRow(990, ['2C', '7D'], 0, true),
    '1': pokerRow(990, ['AH', 'KH'], 10),
    '2': pokerRow(980, ['7C', '2D'], 20),
  },
});
const made = pokerStrategy.choose(afterHumanFold, 1);
assert(made.type !== 'fold', 'a made hand continues after the human folds');
assert(
  JSON.stringify(pokerStrategy.choose(afterHumanFold, 1)) ===
    JSON.stringify(made),
  'the same cards choose the same action',
);
pokerRules.applyIntent(afterHumanFold, made, { seat: seat(1), now: 1 });
const drawSpot = pokerSpot({
  street: 'flop',
  board: ['2H', '9H', '4C'],
  currentBet: 40,
  minRaise: 20,
  pot: 90,
  turnSeatIndex: 1,
  seats: {
    '0': pokerRow(900, ['AS', 'KD'], 0, true),
    '1': pokerRow(960, ['QH', 'JH'], 0),
    '2': pokerRow(920, ['8C', '3D'], 40),
  },
});
const draw = pokerStrategy.choose(drawSpot, 1);
assert(draw.type !== 'fold', 'a drawing hand continues after the human folds');
pokerRules.applyIntent(drawSpot, draw, { seat: seat(1), now: 1 });
const keptPlaying = playBotTurns(
  'poker',
  afterHumanFold,
  [
    { seatIndex: 0, isBot: false },
    { seatIndex: 1, isBot: true },
    { seatIndex: 2, isBot: true },
  ],
  (current, intent, seatIndex) =>
    pokerRules.applyIntent(current as PokerState, intent as PokerIntent, {
      seat: seat(seatIndex),
      now: 1,
    }),
  4,
);
assert(keptPlaying.error === undefined, 'a bot amount stays inside the rules');
assert(keptPlaying.applied[0]?.seatIndex === 1, 'the made hand acts next');
assert(
  keptPlaying.applied[0] !== undefined &&
    typeof keptPlaying.applied[0].intent === 'object' &&
    keptPlaying.applied[0].intent !== null &&
    'type' in keptPlaying.applied[0].intent &&
    keptPlaying.applied[0].intent.type !== 'fold',
  'the made hand does not fold because the human folded',
);
const freeCheck = pokerSpot({
  street: 'flop',
  board: ['AH', 'KD', '9S'],
  currentBet: 0,
  pot: 40,
  turnSeatIndex: 1,
  seats: {
    '0': pokerRow(980, ['QC', 'JS'], 0, true),
    '1': pokerRow(980, ['7C', '2D'], 0),
    '2': pokerRow(980, ['8S', '3H'], 0),
  },
});
assert(
  pokerStrategy.choose(freeCheck, 1).type === 'check',
  'a bot does not fold a free check',
);
const weakBet = pokerSpot({
  street: 'flop',
  board: ['AH', 'KD', '9S'],
  currentBet: 40,
  pot: 80,
  turnSeatIndex: 1,
  seats: {
    '0': pokerRow(940, ['QC', 'JS'], 40),
    '1': pokerRow(980, ['7C', '2D'], 0),
    '2': pokerRow(980, ['8S', '3H'], 0),
  },
});
const weakAfterFold = pokerSpot({
  ...weakBet,
  seats: {
    ...weakBet.seats,
    '0': pokerRow(940, ['QC', 'JS'], 40, true),
  },
});
assert(
  JSON.stringify(pokerStrategy.choose(weakBet, 1)) ===
    JSON.stringify(pokerStrategy.choose(weakAfterFold, 1)),
  'another seat folding does not change the decision',
);
assert(
  pokerStrategy.choose(weakBet, 1).type === 'fold',
  'a weak hand folds when the bet is not free',
);
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
    turnCounts: {},
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

function isChallenge(intent: unknown): boolean {
  return (
    typeof intent === 'object' &&
    intent !== null &&
    'type' in intent &&
    intent.type === 'challenge'
  );
}

const impossible = bluffPlaying({
  hands: { '0': ['QS', 'QH', 'QD', 'QC', 'JR', 'JB'], '1': ['2C'] },
  requiredRank: 'Q',
  discardPile: ['2C'],
  turnSeatIndex: 0,
  lastPlay: { seat: 1, cards: ['2C'], claimRank: 'Q' },
  turnCounts: { '0': 0 },
  playCounts: { '0': 1 },
});
assert(
  isChallenge(sameChoice(impossible)),
  'a bot challenges a claim the deck cannot support',
);
bluffRules.applyIntent(
  impossible,
  { type: 'challenge' },
  {
    seat: seat(0),
    now: 1,
  },
);

const sevenQueens = bluffPlaying({
  hands: { '0': ['AS'], '1': ['2C'] },
  requiredRank: 'Q',
  turnSeatIndex: 0,
  lastPlay: {
    seat: 1,
    cards: ['2C', '2D', '2H', '2S', '3C', '3D', '3H'],
    claimRank: 'Q',
  },
  turnCounts: { '0': 1 },
});
assert(
  isChallenge(sameChoice(sevenQueens)),
  'seven queens cannot be true even when this hand holds none',
);

const oneJokerShort = bluffPlaying({
  hands: { '0': ['QS', 'QH', 'QD', 'QC', 'JR', '2C'], '1': ['KH'] },
  requiredRank: 'Q',
  turnSeatIndex: 0,
  lastPlay: { seat: 1, cards: ['KH', 'KD'], claimRank: 'Q' },
  turnCounts: { '0': 0 },
  playCounts: { '0': 1 },
});
assert(
  isChallenge(sameChoice(oneJokerShort)),
  'jokers count toward the cards that can make a claim true',
);

const stillPossible = bluffPlaying({
  ...oneJokerShort,
  lastPlay: { seat: 1, cards: ['KH'], claimRank: 'Q' },
});
const possiblePlay = sameChoice(stillPossible);
assert(
  !isChallenge(possiblePlay) && playedCard(possiblePlay) === 'QC',
  'one queen still looks possible, so the bot plays a queen',
);

const cadence = bluffPlaying({
  hands: { '0': ['4D', '2C'], '1': ['KH'] },
  requiredRank: '4',
  turnSeatIndex: 0,
  lastPlay: { seat: 1, cards: ['KH'], claimRank: '4' },
  turnCounts: { '0': BLUFF_CHALLENGE_EVERY - 1 },
  playCounts: { '0': 1 },
});
assert(
  isChallenge(sameChoice(cadence)),
  'every fourth turn challenges an honest-looking play',
);
const beforeCadence = bluffPlaying({
  ...cadence,
  turnCounts: { '0': BLUFF_CHALLENGE_EVERY - 2 },
});
assert(
  !isChallenge(sameChoice(beforeCadence)),
  'the turns between the cadence are not automatic challenges',
);

const ownPlay = bluffPlaying({
  hands: { '0': ['4D', '2C'], '1': ['KH'] },
  requiredRank: '4',
  turnSeatIndex: 0,
  lastPlay: {
    seat: 0,
    cards: ['KH', 'KD', 'KC', 'KS', '2H', '2S', '2D'],
    claimRank: '4',
  },
  turnCounts: { '0': BLUFF_CHALLENGE_EVERY - 1 },
  playCounts: { '0': 1 },
});
assert(
  !isChallenge(sameChoice(ownPlay)),
  'a bot never challenges its own play',
);
