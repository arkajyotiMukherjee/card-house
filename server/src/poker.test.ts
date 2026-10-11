import type { PokerState } from '../../src/shared/games/poker.ts';
import {
  POKER_BIG_BLIND,
  POKER_RANKS,
  POKER_SMALL_BLIND,
  POKER_STARTING_CHIPS,
  POKER_SUITS,
  POKER_VARIATIONS,
  bestPokerHand,
  comparePokerScores,
  pokerGameDefinition,
  pokerRules,
  potLimitCeiling,
} from '../../src/shared/games/poker.ts';
import type {
  GameSeat,
  GameTable,
  IntentContext,
} from '../../src/shared/games/game-rules.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

function table(variation?: string): GameTable {
  return {
    id: 'table-poker',
    lobbyId: 'lobby-1',
    gameType: pokerGameDefinition.gameType,
    name: 'Poker #1',
    status: 'waiting_for_players',
    minPlayers: pokerGameDefinition.minPlayers,
    maxPlayers: pokerGameDefinition.maxPlayers,
    stateJson: variation ? JSON.stringify({ variation }) : '{}',
    createdAt: 1,
  };
}

function context(seatIndex: number): IntentContext {
  return { seat: seat(seatIndex), now: 1 };
}

function rejects(run: () => void, message: string): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof Error, `expected ${message}`);
  assert(
    thrown.message === message,
    `expected ${message}, got ${thrown.message}`,
  );
}

function standardDeck(): Set<string> {
  const deck = new Set<string>();
  for (const suit of POKER_SUITS) {
    for (const rank of POKER_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

function chipSum(state: PokerState): number {
  let total = 0;
  for (const seat of Object.values(state.seats)) {
    total += seat.chips;
  }
  return total;
}

function holeAt(state: PokerState, seatIndex: number): string[] {
  return state.seats[String(seatIndex)]?.hole ?? [];
}

function playChecks(start: PokerState): PokerState {
  let state = start;
  let guard = 0;
  while (state.phase === 'play') {
    guard += 1;
    assert(guard < 40, 'the hand did not finish');
    const turn = state.turnSeatIndex;
    assert(turn !== null, 'a live hand has a turn');
    if (state.step === 'discard') {
      const card = holeAt(state, turn)[0];
      assert(card !== undefined, 'a discard needs a hole card');
      state = pokerRules.applyIntent(
        state,
        { type: 'discard', card },
        context(turn),
      );
      continue;
    }
    const seat = state.seats[String(turn)];
    assert(seat !== undefined, 'the turn seat is dealt in');
    if (seat.streetBet === state.currentBet) {
      state = pokerRules.applyIntent(state, { type: 'check' }, context(turn));
    } else {
      state = pokerRules.applyIntent(state, { type: 'call' }, context(turn));
    }
  }
  return state;
}

assert(pokerGameDefinition.gameType === 'poker', 'catalog key is poker');
assert(pokerGameDefinition.displayName === 'Poker', 'display name is Poker');
assert(pokerGameDefinition.minPlayers === 2, 'poker seats at least 2');
assert(pokerGameDefinition.maxPlayers === 8, 'poker seats at most 8');
assert(
  pokerGameDefinition.howToPlay.includes("Texas Hold'em"),
  "how to play names Hold'em",
);
assert(
  pokerGameDefinition.howToPlay.includes('Omaha'),
  'how to play names Omaha',
);
assert(
  pokerGameDefinition.howToPlay.includes('Oklahoma'),
  'how to play names Oklahoma',
);
assert(POKER_VARIATIONS.length === 3, 'three variations and no more');

const empty = pokerRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(empty.variation === 'holdem', "a missing variation is Hold'em");
assert(Object.keys(empty.seats).length === 0, 'no seats deals nobody');
assert(
  pokerRules.initialState([seat(0)], table()).phase === 'lobby',
  'one seat waits',
);

const deck = standardDeck();
const pair = [0, 1].map(seat);
const dealt = pokerRules.initialState(pair, table());
assert(dealt.phase === 'play', 'two seats start the hand');
assert(dealt.variation === 'holdem', "the default deal is Hold'em");
assert(dealt.limit === 'no-limit', "Hold'em is no-limit");
assert(dealt.street === 'preflop', 'the hand starts preflop');
assert(dealt.board.length === 0, 'the board is empty before the flop');
assert(holeAt(dealt, 0).length === 2, "Hold'em deals two hole cards");
assert(holeAt(dealt, 1).length === 2, "both Hold'em seats get two cards");
assert(
  dealt.pot === POKER_SMALL_BLIND + POKER_BIG_BLIND,
  'blinds make the pot',
);
assert(
  dealt.currentBet === POKER_BIG_BLIND,
  'the big blind is the bet to call',
);
assert(dealt.dealerSeatIndex === 0, 'the lowest seat is the button');
assert(dealt.turnSeatIndex === 0, 'heads-up, the button acts first preflop');
const seen = new Set<string>([
  ...holeAt(dealt, 0),
  ...holeAt(dealt, 1),
  ...dealt.deck,
]);
assert(seen.size === 52, 'the shuffle keeps every card');
for (const card of seen) {
  assert(deck.has(card), `shuffled card ${card} belongs to the deck`);
}
const orderedDeal = [
  holeAt(dealt, 1)[0],
  holeAt(dealt, 0)[0],
  holeAt(dealt, 1)[1],
  holeAt(dealt, 0)[1],
  ...dealt.deck,
].join();
const fresh = [];
for (const suit of POKER_SUITS) {
  for (const rank of POKER_RANKS) {
    fresh.push(`${rank}${suit}`);
  }
}
assert(orderedDeal !== fresh.join(), 'the deck is not left in suit order');
const again = pokerRules.initialState(pair, table());
assert(
  [...holeAt(again, 0), ...holeAt(again, 1), ...again.deck].join() ===
    [...holeAt(dealt, 0), ...holeAt(dealt, 1), ...dealt.deck].join(),
  'the same table id shuffles the same way',
);
const otherTable = pokerRules.initialState(pair, {
  ...table(),
  id: 'table-poker-b',
});
assert(
  [...holeAt(otherTable, 0), ...otherTable.deck].join() !==
    [...holeAt(dealt, 0), ...dealt.deck].join(),
  'another table id shuffles a different deck',
);

const chipsBefore = dealt.seats['0']?.chips ?? 0;
rejects(
  () => pokerRules.applyIntent(dealt, { type: 'check' }, context(0)),
  'Invalid intent',
);
assert(
  dealt.seats['0']?.chips === chipsBefore,
  'a rejected check leaves the chips',
);
rejects(
  () => pokerRules.applyIntent(dealt, { type: 'call' }, context(1)),
  'Not your turn',
);
rejects(
  () => pokerRules.applyIntent(dealt, { type: 'bet', amount: 20 }, context(0)),
  'Invalid intent',
);
rejects(
  () =>
    pokerRules.applyIntent(dealt, { type: 'raise', amount: 30 }, context(0)),
  'Invalid intent',
);
rejects(
  () =>
    pokerRules.applyIntent(
      dealt,
      { type: 'discard', card: holeAt(dealt, 0)[0] ?? 'AS' },
      context(0),
    ),
  'Invalid intent',
);

const raised = pokerRules.applyIntent(
  dealt,
  { type: 'raise', amount: 200 },
  context(0),
);
assert(raised !== dealt, 'a legal raise returns a new state');
assert(raised.currentBet === 200, 'no-limit can raise past the pot');
assert(raised.seats['0']?.streetBet === 200, 'the raise is the new street bet');
assert(raised.turnSeatIndex === 1, 'the big blind answers the raise');
rejects(
  () =>
    pokerRules.applyIntent(dealt, { type: 'raise', amount: 5000 }, context(0)),
  'Invalid intent',
);

const called = pokerRules.applyIntent(dealt, { type: 'call' }, context(0));
assert(
  called.seats['0']?.streetBet === POKER_BIG_BLIND,
  'a call matches the blind',
);
assert(called.pot === POKER_BIG_BLIND * 2, 'the called pot holds both blinds');
const checked = pokerRules.applyIntent(
  called,
  { type: 'check' },
  context(called.turnSeatIndex ?? 1),
);
assert(checked.street === 'flop', 'checking the blind deals the flop');
assert(checked.board.length === 3, 'the flop is three cards');
assert(checked.currentBet === 0, 'the next street opens with no bet');
const bet = pokerRules.applyIntent(
  checked,
  { type: 'bet', amount: POKER_BIG_BLIND },
  context(checked.turnSeatIndex ?? 0),
);
assert(bet.currentBet === POKER_BIG_BLIND, 'an opening bet sets the street');
rejects(
  () =>
    pokerRules.applyIntent(
      checked,
      { type: 'check' },
      context(checked.turnSeatIndex ?? 0),
    ) &&
    pokerRules.applyIntent(
      bet,
      { type: 'check' },
      context(bet.turnSeatIndex ?? 0),
    ),
  'Invalid intent',
);

const folded = pokerRules.applyIntent(dealt, { type: 'fold' }, context(0));
assert(folded.phase === 'finished', 'the last fold ends the hand');
assert(folded.end === 'fold', 'a fold win is not a showdown');
assert(
  folded.winnerSeatIndexes.join() === '1',
  'the big blind wins the blinds',
);
assert(
  folded.seats['1']?.chips === POKER_STARTING_CHIPS + POKER_SMALL_BLIND,
  'the winner is paid the pot',
);
assert(
  folded.seats['0']?.chips === POKER_STARTING_CHIPS - POKER_SMALL_BLIND,
  'the folder keeps the rest',
);
assert(
  chipSum(folded) === POKER_STARTING_CHIPS * 2,
  'fold scoring keeps every chip',
);
const foldNote = pokerRules.eventNote?.(
  dealt,
  { type: 'fold' },
  folded,
  context(0),
);
assert(
  foldNote !== null &&
    typeof foldNote === 'object' &&
    'kind' in foldNote &&
    foldNote.kind === 'finished',
  'ending the hand announces the winner',
);

const three = pokerRules.initialState([0, 1, 2].map(seat), table());
assert(
  three.turnSeatIndex === 0,
  'three-handed, the seat after the big blind acts',
);
const threeFold = pokerRules.applyIntent(three, { type: 'fold' }, context(0));
assert(threeFold.phase === 'play', 'one fold leaves the blinds playing');
const threeNote = pokerRules.eventNote?.(
  three,
  { type: 'fold' },
  threeFold,
  context(0),
);
assert(
  threeNote !== null &&
    typeof threeNote === 'object' &&
    'kind' in threeNote &&
    threeNote.kind === 'fold',
  'a fold that stays live is a fold note',
);

const holdemShowdown = playChecks(dealt);
assert(holdemShowdown.phase === 'finished', "Hold'em finishes");
assert(holdemShowdown.end === 'showdown', 'checking down reaches showdown');
assert(holdemShowdown.board.length === 5, 'showdown has a full board');
assert(
  holeAt(holdemShowdown, 0).length === 2,
  "Hold'em still has two hole cards",
);
assert(
  chipSum(holdemShowdown) === POKER_STARTING_CHIPS * 2,
  'showdown scoring keeps every chip',
);
assert(holdemShowdown.winnerSeatIndexes.length > 0, 'showdown names a winner');

const royal = bestPokerHand('holdem', [], ['AS', 'KS', 'QS', 'JS', '10S']);
assert(royal.name === 'royal flush', 'ace-high straight flush is a royal');
const steelWheel = bestPokerHand('holdem', [], ['AH', '2H', '3H', '4H', '5H']);
assert(steelWheel.name === 'straight flush', 'a wheel flush is not a royal');
assert(
  comparePokerScores(royal.score, steelWheel.score) > 0,
  'a royal beats a wheel flush',
);
const quads = bestPokerHand(
  'holdem',
  ['AS', 'KS'],
  ['AH', 'AD', 'AC', '7S', '8S'],
);
assert(
  quads.name === 'four of a kind',
  "Hold'em may use one hole card and the board",
);
const boardRoyal = bestPokerHand(
  'holdem',
  ['2C', '3D'],
  ['AS', 'KS', 'QS', 'JS', '10S'],
);
assert(boardRoyal.name === 'royal flush', "Hold'em may use the board alone");
const straight = bestPokerHand(
  'holdem',
  ['AS', 'KS'],
  ['QH', 'JH', '10D', '2C', '3D'],
);
assert(straight.name === 'straight', "Hold'em may use both hole cards");
const wheel = bestPokerHand('holdem', [], ['AS', '2D', '3C', '4H', '5S']);
const sixHigh = bestPokerHand('holdem', [], ['6S', '2D', '3C', '4H', '5S']);
assert(wheel.name === 'straight', 'A-5 is a straight');
assert(
  comparePokerScores(sixHigh.score, wheel.score) > 0,
  'a six-high straight beats the wheel',
);
const flush = bestPokerHand('holdem', [], ['2S', '5S', '7S', '9S', 'JS']);
assert(flush.name === 'flush', 'five suited cards are a flush');
assert(
  comparePokerScores(flush.score, straight.score) > 0,
  'a flush beats a straight',
);
const trips = bestPokerHand('holdem', [], ['KH', 'KD', 'KC', '2S', '3D']);
assert(
  trips.name === 'three of a kind',
  'three of a kind ranks below a straight',
);
const twoPair = bestPokerHand('holdem', [], ['AH', 'AD', 'KS', 'KD', '2C']);
assert(twoPair.name === 'two pair', 'two pair is ranked');
const onePair = bestPokerHand(
  'holdem',
  ['AH', 'KD'],
  ['AS', '2C', '7D', '9H', 'JS'],
);
const pairWorse = bestPokerHand(
  'holdem',
  ['AH', 'QD'],
  ['AS', '2C', '7D', '9H', 'JS'],
);
assert(onePair.name === 'one pair', 'a pair is ranked');
assert(
  comparePokerScores(onePair.score, pairWorse.score) > 0,
  'the king kicker beats the queen',
);
const high = bestPokerHand('holdem', [], ['AH', 'KD', '9C', '5S', '3D']);
assert(high.name === 'high card', 'ace high is a high card hand');
assert(
  comparePokerScores(onePair.score, high.score) > 0,
  'a pair beats ace high',
);

const omahaDealt = pokerRules.initialState(pair, table('omaha'));
assert(omahaDealt.variation === 'omaha', 'the table variation deals Omaha');
assert(omahaDealt.limit === 'pot-limit', 'Omaha is pot-limit');
assert(holeAt(omahaDealt, 0).length === 4, 'Omaha deals four hole cards');
assert(holeAt(omahaDealt, 1).length === 4, 'both Omaha seats get four cards');
const omahaCeiling = potLimitCeiling(omahaDealt, 0);
assert(omahaCeiling === 60, 'the pot-sized raise includes the call');
rejects(
  () =>
    pokerRules.applyIntent(
      omahaDealt,
      { type: 'raise', amount: omahaCeiling + 1 },
      context(0),
    ),
  'Invalid intent',
);
const omahaRaise = pokerRules.applyIntent(
  omahaDealt,
  { type: 'raise', amount: omahaCeiling },
  context(0),
);
assert(omahaRaise.currentBet === omahaCeiling, 'a pot-sized raise is legal');
const omahaShowdown = playChecks(omahaDealt);
assert(omahaShowdown.phase === 'finished', 'Omaha finishes');
assert(omahaShowdown.end === 'showdown', 'Omaha can be checked to showdown');
assert(omahaShowdown.board.length === 5, 'Omaha deals the full board');
assert(holeAt(omahaShowdown, 0).length === 4, 'Omaha keeps four hole cards');
assert(
  chipSum(omahaShowdown) === POKER_STARTING_CHIPS * 2,
  'Omaha scoring keeps every chip',
);
const omahaCards = ['KH', 'QD', 'JC', '10S'];
const omahaBoard = ['AH', 'AD', 'AC', 'AS', '2C'];
const omahaBest = bestPokerHand('omaha', omahaCards, omahaBoard);
const holdemSame = bestPokerHand('holdem', omahaCards, omahaBoard);
assert(
  holdemSame.name === 'four of a kind',
  "Hold'em can play the four aces on the board",
);
assert(
  omahaBest.name === 'three of a kind',
  'Omaha cannot use four community cards',
);
assert(
  omahaBest.cards.filter((card) => omahaCards.includes(card)).length === 2,
  'Omaha uses exactly two hole cards',
);
assert(
  omahaBest.cards.filter((card) => omahaBoard.includes(card)).length === 3,
  'Omaha uses exactly three community cards',
);

const oklahomaDealt = pokerRules.initialState(pair, table('oklahoma'));
assert(
  oklahomaDealt.variation === 'oklahoma',
  'the table variation deals Oklahoma',
);
assert(oklahomaDealt.limit === 'pot-limit', 'Oklahoma is pot-limit');
assert(
  holeAt(oklahomaDealt, 0).length === 4,
  'Oklahoma starts with four hole cards',
);
rejects(
  () =>
    pokerRules.applyIntent(
      oklahomaDealt,
      { type: 'raise', amount: potLimitCeiling(oklahomaDealt, 0) + 1 },
      context(0),
    ),
  'Invalid intent',
);
const oklahomaCalled = pokerRules.applyIntent(
  oklahomaDealt,
  { type: 'call' },
  context(0),
);
const oklahomaFlop = pokerRules.applyIntent(
  oklahomaCalled,
  { type: 'check' },
  context(oklahomaCalled.turnSeatIndex ?? 1),
);
assert(oklahomaFlop.street === 'flop', 'Oklahoma deals a flop');
assert(oklahomaFlop.step === 'discard', 'the flop starts with a discard');
assert(holeAt(oklahomaFlop, 0).length === 4, 'discards have not happened yet');
rejects(
  () =>
    pokerRules.applyIntent(
      oklahomaFlop,
      { type: 'check' },
      context(oklahomaFlop.turnSeatIndex ?? 0),
    ),
  'Invalid intent',
);
rejects(
  () =>
    pokerRules.applyIntent(
      oklahomaFlop,
      { type: 'discard', card: '2C' },
      context(oklahomaFlop.turnSeatIndex ?? 0),
    ),
  'Invalid intent',
);
const firstDiscardSeat = oklahomaFlop.turnSeatIndex ?? 0;
const firstCard = holeAt(oklahomaFlop, firstDiscardSeat)[0] ?? 'AS';
const afterFirst = pokerRules.applyIntent(
  oklahomaFlop,
  { type: 'discard', card: firstCard },
  context(firstDiscardSeat),
);
assert(
  holeAt(afterFirst, firstDiscardSeat).length === 3,
  'the flop discard drops one hole card',
);
assert(
  !holeAt(afterFirst, firstDiscardSeat).includes(firstCard),
  'the discarded card leaves the hand',
);
const discardNote = pokerRules.eventNote?.(
  oklahomaFlop,
  { type: 'discard', card: firstCard },
  afterFirst,
  context(firstDiscardSeat),
);
assert(
  discardNote !== null &&
    typeof discardNote === 'object' &&
    'kind' in discardNote &&
    discardNote.kind === 'discard',
  'a discard announces itself',
);
const secondDiscardSeat = afterFirst.turnSeatIndex ?? 0;
const secondCard = holeAt(afterFirst, secondDiscardSeat)[0] ?? 'AS';
const afterDiscard = pokerRules.applyIntent(
  afterFirst,
  { type: 'discard', card: secondCard },
  context(secondDiscardSeat),
);
assert(
  afterDiscard.step === 'bet',
  'betting starts after every live player discards',
);
assert(
  holeAt(afterDiscard, 0).length === 3,
  'both seats discarded on the flop',
);
assert(
  holeAt(afterDiscard, 1).length === 3,
  'the other seat discarded on the flop',
);
const oklahomaShowdown = playChecks(afterDiscard);
assert(oklahomaShowdown.phase === 'finished', 'Oklahoma finishes');
assert(oklahomaShowdown.end === 'showdown', 'Oklahoma reaches showdown');
assert(oklahomaShowdown.board.length === 5, 'Oklahoma deals the full board');
assert(
  holeAt(oklahomaShowdown, 0).length === 2,
  'Oklahoma showdown keeps two hole cards',
);
assert(
  holeAt(oklahomaShowdown, 1).length === 2,
  'both Oklahoma seats keep two hole cards',
);
assert(
  chipSum(oklahomaShowdown) === POKER_STARTING_CHIPS * 2,
  'Oklahoma scoring keeps every chip',
);
const oklahomaHole = ['KH', 'QD'];
const oklahomaBoard = ['AH', 'AD', 'AC', 'AS', '2C'];
const oklahomaBest = bestPokerHand('oklahoma', oklahomaHole, oklahomaBoard);
assert(
  oklahomaBest.name === 'three of a kind',
  'Oklahoma must use both hole cards',
);
assert(
  oklahomaBest.cards.filter((card) => oklahomaHole.includes(card)).length === 2,
  'Oklahoma uses the two remaining hole cards',
);
assert(
  oklahomaBest.cards.filter((card) => oklahomaBoard.includes(card)).length ===
    3,
  'Oklahoma uses exactly three community cards',
);

function riverSeat(
  chips: number,
  hole: string[],
  committed: number,
  allIn: boolean,
  acted: boolean,
): PokerState['seats'][string] {
  return {
    chips,
    hole,
    streetBet: 0,
    committed,
    folded: false,
    allIn,
    acted,
    mustDiscard: false,
  };
}

const side: PokerState = {
  phase: 'play',
  variation: 'holdem',
  street: 'river',
  step: 'bet',
  deck: [],
  board: ['AH', 'AD', 'AC', '7S', '8S'],
  seats: {
    '0': riverSeat(0, ['AS', 'KS'], 50, true, true),
    '1': riverSeat(500, ['2C', '3D'], 100, false, false),
    '2': riverSeat(500, ['9C', '9D'], 100, false, false),
  },
  order: [0, 1, 2],
  dealerSeatIndex: 0,
  turnSeatIndex: 1,
  currentBet: 0,
  minRaise: POKER_BIG_BLIND,
  pot: 250,
  pots: [],
  winnerSeatIndexes: [],
  hands: {},
  end: null,
  smallBlind: POKER_SMALL_BLIND,
  bigBlind: POKER_BIG_BLIND,
  limit: 'no-limit',
};
const sideChecked = pokerRules.applyIntent(side, { type: 'check' }, context(1));
const sideDone = pokerRules.applyIntent(
  sideChecked,
  { type: 'check' },
  context(2),
);
assert(sideDone.phase === 'finished', 'matched river bets go to showdown');
assert(sideDone.end === 'showdown', 'the side pot is scored at showdown');
assert(sideDone.seats['0']?.chips === 150, 'the all-in quads win the main pot');
assert(sideDone.seats['1']?.chips === 500, 'the losing side pot pays nothing');
assert(sideDone.seats['2']?.chips === 600, 'the full house wins the side pot');
assert(sideDone.pots.length === 2, 'unequal all-ins make a side pot');
assert(chipSum(sideDone) === 1250, 'side pot scoring keeps every chip');

const split: PokerState = {
  phase: 'play',
  variation: 'holdem',
  street: 'river',
  step: 'bet',
  deck: [],
  board: ['AS', 'KS', 'QS', 'JS', '10S'],
  seats: {
    '0': riverSeat(100, ['2C', '3D'], 10, false, false),
    '1': riverSeat(100, ['4C', '5D'], 10, false, false),
    '2': {
      chips: 99,
      hole: ['9H', '9D'],
      streetBet: 0,
      committed: 1,
      folded: true,
      allIn: false,
      acted: true,
      mustDiscard: false,
    },
  },
  order: [0, 1, 2],
  dealerSeatIndex: 0,
  turnSeatIndex: 1,
  currentBet: 0,
  minRaise: POKER_BIG_BLIND,
  pot: 21,
  pots: [],
  winnerSeatIndexes: [],
  hands: {},
  end: null,
  smallBlind: POKER_SMALL_BLIND,
  bigBlind: POKER_BIG_BLIND,
  limit: 'no-limit',
};
const splitChecked = pokerRules.applyIntent(
  split,
  { type: 'check' },
  context(1),
);
const splitDone = pokerRules.applyIntent(
  splitChecked,
  { type: 'check' },
  context(0),
);
assert(splitDone.end === 'showdown', 'the same royal on the board is a split');
assert(
  splitDone.winnerSeatIndexes.join() === '0,1',
  'both live seats split the pot',
);
assert(
  (splitDone.seats['0']?.chips ?? 0) + (splitDone.seats['1']?.chips ?? 0) ===
    221,
  'the folded chip is paid out',
);
assert(
  (splitDone.seats['1']?.chips ?? 0) > (splitDone.seats['0']?.chips ?? 0),
  'the odd chip goes to the first live seat left of the button',
);

rejects(
  () => pokerRules.initialState(pair, table('draw')),
  'Invalid table state',
);
rejects(
  () => pokerRules.applyIntent(folded, { type: 'check' }, context(1)),
  'Invalid intent',
);

console.log(
  JSON.stringify({
    holdem: holdemShowdown.end === 'showdown',
    omaha: omahaShowdown.end === 'showdown',
    oklahoma: oklahomaShowdown.end === 'showdown',
    sidePots: sideDone.pots.length,
  }),
);
