import type {
  BlackjackSeatState,
  BlackjackState,
} from '../../src/shared/games/blackjack.ts';
import {
  BLACKJACK_RANKS,
  BLACKJACK_STARTING_CHIPS,
  BLACKJACK_SUITS,
  blackjackGameDefinition,
  blackjackRules,
  blackjackTotal,
} from '../../src/shared/games/blackjack.ts';
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

function table(): GameTable {
  return {
    id: 'table-blackjack',
    lobbyId: 'lobby-1',
    gameType: blackjackGameDefinition.gameType,
    name: 'Blackjack #1',
    status: 'waiting_for_players',
    minPlayers: blackjackGameDefinition.minPlayers,
    maxPlayers: blackjackGameDefinition.maxPlayers,
    stateJson: '{}',
    createdAt: 1,
  };
}

function context(seatIndex: number): IntentContext {
  return {
    seat: seat(seatIndex),
    now: 1,
  };
}

function standardDeck(): Set<string> {
  const deck = new Set<string>();
  for (const suit of BLACKJACK_SUITS) {
    for (const rank of BLACKJACK_RANKS) {
      deck.add(`${rank}${suit}`);
    }
  }
  return deck;
}

function player(
  cards: string[],
  bet: number,
  chips: number,
  done = false,
): BlackjackSeatState {
  return {
    chips,
    bet,
    hands: [{ cards, bet, done }],
    handIndex: 0,
    results: [],
  };
}

function acting(
  seats: Record<string, BlackjackSeatState>,
  extras: Partial<BlackjackState> = {},
): BlackjackState {
  return {
    phase: 'play',
    step: 'act',
    deck: [],
    dealer: ['10D', '7H'],
    holeHidden: true,
    seats,
    turnSeatIndex: 0,
    winnerSeatIndexes: [],
    ...extras,
  };
}

const empty = blackjackRules.initialState([], table());
assert(empty.phase === 'lobby', 'no seats stays in the lobby');
assert(Object.keys(empty.seats).length === 0, 'no seats deals no players');
assert(empty.deck.length === 0, 'no seats keeps the deck closed');
assert(empty.turnSeatIndex === null, 'no seats has no turn');

// A new shoe contains six complete decks, and the cut is applied between hands.
const freshShoe = blackjackRules.initialState([seat(0)], table()).deck;
assert(freshShoe.length === 312, 'six decks contain 312 cards');
for (const face of standardDeck())
  assert(
    freshShoe.filter((card) => card === face).length === 6,
    'each face occurs six times',
  );
for (const remaining of [79, 78]) {
  const shoe = freshShoe.slice(0, remaining);
  const previous = acting(
    { '0': player(['10S', '7H'], 10, 200) },
    { phase: 'finished', deck: shoe },
  );
  const next = blackjackRules.initialState([seat(0)], {
    ...table(),
    stateJson: JSON.stringify(previous),
  });
  assert(
    next.deck.length === (remaining > 78 ? remaining : 312),
    'reshuffle at the 75 percent cut',
  );
  if (remaining > 78)
    assert(
      JSON.stringify(next.deck) === JSON.stringify(shoe),
      'preserve shoe order before the cut',
    );
}

const deck = standardDeck();
const ordered = [2, 0].map(seat);
const bought = blackjackRules.initialState(ordered, table());
assert(bought.phase === 'play', 'a seated table starts in play');
assert(bought.step === 'bet', 'the first action is a bet');
assert(bought.turnSeatIndex === 0, 'the lowest seat bets first');
assert(Object.keys(bought.seats).length === 2, 'both seats buy in');
assert(bought.deck.length === 312, 'the shoe has six decks');
assert(new Set(bought.deck).size === 52, 'the shoe has all 52 card faces');
for (const card of bought.deck) {
  assert(deck.has(card), `shuffled card ${card} belongs to the deck`);
}
assert(
  bought.deck.join() !== [...deck].join(),
  'the shoe is not left in suit order',
);
const again = blackjackRules.initialState(ordered, table());
assert(
  again.deck.join() === bought.deck.join(),
  'the same table id shuffles the same way',
);
assert(
  bought.seats['0'].chips === BLACKJACK_STARTING_CHIPS,
  'a seat buys in for the starting stack',
);
assert(bought.dealer.length === 0, 'betting deals no dealer cards');

const otherTable = blackjackRules.initialState(ordered, {
  ...table(),
  id: 'table-blackjack-b',
});
assert(
  otherTable.deck.join() !== bought.deck.join(),
  'another table id shuffles a different shoe',
);

const bet = blackjackRules.applyIntent(
  bought,
  { type: 'bet', amount: 10 },
  context(0),
);
assert(bet !== bought, 'a legal bet returns a new state');
assert(bet.seats['0'].bet === 10, 'the stake is recorded');
assert(
  bet.seats['0'].chips === BLACKJACK_STARTING_CHIPS - 10,
  'the stake leaves the stack',
);
assert(bet.turnSeatIndex === 2, 'the other seated player bets next');
assert(bet.step === 'bet', 'one bet does not deal yet');
assert(
  bought.seats['0'].chips === BLACKJACK_STARTING_CHIPS,
  'a legal bet leaves the previous stack in place',
);

const betNote = blackjackRules.eventNote(
  bought,
  { type: 'bet', amount: 10 },
  bet,
  context(0),
);
assert(
  JSON.stringify(betNote) ===
    JSON.stringify({ kind: 'bet', seat: 0, amount: 10 }),
  'a bet notes the seat and the stake',
);

const beforeIllegal = JSON.stringify(bought);
let rejected = false;
try {
  blackjackRules.applyIntent(bought, { type: 'bet', amount: 10 }, context(2));
} catch (error) {
  rejected = error instanceof Error && error.message === 'Not your turn';
}
assert(rejected, 'a bet from another seat is rejected');
assert(
  JSON.stringify(bought) === beforeIllegal,
  'a rejected bet does not change state',
);

let badAmount = false;
try {
  blackjackRules.applyIntent(bought, { type: 'bet', amount: 7 }, context(0));
} catch (error) {
  badAmount = error instanceof Error && error.message === 'Invalid intent';
}
assert(badAmount, 'a stake outside 10, 25, and 50 is rejected');

let earlyHit = false;
try {
  blackjackRules.applyIntent(bought, { type: 'hit' }, context(0));
} catch (error) {
  earlyHit = error instanceof Error && error.message === 'Invalid intent';
}
assert(earlyHit, 'a hit before the deal is rejected');

const dealt = blackjackRules.applyIntent(
  bet,
  { type: 'bet', amount: 25 },
  context(2),
);
assert(
  dealt.step === 'act' || dealt.phase === 'finished',
  'the second bet deals',
);
assert(dealt.dealer.length === 2, 'the dealer receives two cards');
assert(
  dealt.seats['0'].hands[0].cards.length === 2,
  'seat 0 receives two cards',
);
assert(
  dealt.seats['2'].hands[0].cards.length === 2,
  'seat 2 receives two cards',
);
assert(
  dealt.seats['0'].hands[0].cards[0] === bought.deck[0],
  'the first card goes to the lowest seat',
);
assert(
  dealt.seats['2'].hands[0].cards[0] === bought.deck[1],
  'the next card goes to the other seat',
);
assert(
  dealt.dealer[0] === bought.deck[2],
  'the dealer upcard follows the players',
);
assert(
  dealt.seats['0'].hands[0].cards[1] === bought.deck[3],
  'the second pass returns to the lowest seat',
);
assert(
  dealt.dealer[1] === bought.deck[5],
  'the dealer hole card is dealt last',
);
if (dealt.phase === 'play') {
  assert(dealt.holeHidden, 'the hole card stays hidden during play');
}
const used = [
  ...dealt.seats['0'].hands[0].cards,
  ...dealt.seats['2'].hands[0].cards,
  ...dealt.dealer,
  ...dealt.deck,
];
assert(used.length === 312, 'the deal accounts for every card in the shoe');
assert(new Set(used).size === 52, 'the dealt shoe retains all 52 faces');

let guard = 0;
let finished = blackjackRules.initialState([seat(0), seat(1)], table());
while (finished.phase === 'play' && guard < 30) {
  guard += 1;
  const actor = finished.turnSeatIndex;
  assert(actor !== null, 'play has a seat to act');
  if (finished.step === 'bet') {
    finished = blackjackRules.applyIntent(
      finished,
      { type: 'bet', amount: 10 },
      context(actor),
    );
    continue;
  }
  finished = blackjackRules.applyIntent(
    finished,
    finished.step === 'insurance'
      ? { type: 'insurance', take: false }
      : { type: 'stand' },
    context(actor),
  );
}
assert(
  finished.phase === 'finished',
  'standing through the round finishes the game',
);
assert(finished.holeHidden === false, 'a finished round shows the hole card');
assert(finished.turnSeatIndex === null, 'a finished round has no turn');
assert(guard < 30, 'the round ends without an extra loop');

let afterFinish = false;
try {
  blackjackRules.applyIntent(finished, { type: 'hit' }, context(0));
} catch (error) {
  afterFinish = error instanceof Error && error.message === 'Invalid intent';
}
assert(afterFinish, 'a move after the round is rejected');

const busted = blackjackRules.applyIntent(
  acting(
    { '0': player(['10S', '9H'], 10, 190) },
    { deck: ['5C'], dealer: ['10D', '7H'] },
  ),
  { type: 'hit' },
  context(0),
);
assert(busted.phase === 'finished', 'a bust finishes a one-player round');
assert(
  blackjackTotal(busted.seats['0'].hands[0].cards) === 24,
  'the hit busts a 19',
);
assert(busted.seats['0'].results[0] === 'lose', 'a bust loses');
assert(busted.seats['0'].chips === 190, 'a loss keeps the stake');
assert(busted.dealer.length === 2, 'the dealer stands when every player busts');
const bustNote = blackjackRules.eventNote(
  acting(
    { '0': player(['10S', '9H'], 10, 190) },
    { deck: ['5C'], dealer: ['10D', '7H'] },
  ),
  { type: 'hit' },
  busted,
  context(0),
);
assert(
  bustNote !== null && bustNote.kind === 'hit' && bustNote.bust,
  'a busting hit notes the bust',
);

const won = blackjackRules.applyIntent(
  acting(
    { '0': player(['10S', '9H'], 10, 190) },
    { deck: ['KS'], dealer: ['10D', '7H'] },
  ),
  { type: 'stand' },
  context(0),
);
assert(won.phase === 'finished', 'a stand against 17 finishes the round');
assert(won.dealer.length === 2, 'the dealer stands on 17');
assert(won.deck[0] === 'KS', 'a standing dealer leaves the next card');
assert(won.seats['0'].results[0] === 'win', '19 beats 17');
assert(won.seats['0'].chips === 210, 'a win returns the stake and even money');
assert(won.winnerSeatIndexes[0] === 0, 'the winning seat is recorded');

const pushed = blackjackRules.applyIntent(
  acting({ '0': player(['10S', '7H'], 10, 190) }, { dealer: ['9D', '8C'] }),
  { type: 'stand' },
  context(0),
);
assert(pushed.seats['0'].results[0] === 'push', 'equal totals push');
assert(pushed.seats['0'].chips === 200, 'a push returns the stake');
assert(pushed.winnerSeatIndexes.length === 0, 'a push has no winner');

const natural = blackjackRules.applyIntent(
  acting(
    {
      '0': player(['AS', 'KH'], 10, 190, true),
      '1': player(['10S', '8H'], 10, 190),
    },
    { turnSeatIndex: 1, dealer: ['9D', '8C'] },
  ),
  { type: 'stand' },
  context(1),
);
assert(
  natural.seats['0'].results[0] === 'blackjack',
  'a two-card 21 is a natural',
);
assert(natural.seats['0'].chips === 215, 'a natural pays 3 to 2');
assert(natural.seats['1'].results[0] === 'win', '18 still beats a dealer 17');
assert(
  natural.winnerSeatIndexes.join() === '0,1',
  'both winning seats are recorded',
);

const dealerNatural = blackjackRules.applyIntent(
  acting(
    {
      '0': player(['AH', 'KS'], 10, 190, true),
      '1': player(['10S', '9H'], 10, 190),
    },
    { turnSeatIndex: 1, dealer: ['AS', 'KD'], deck: ['2C'] },
  ),
  { type: 'stand' },
  context(1),
);
assert(
  dealerNatural.dealer.length === 2,
  'a dealer natural takes no more cards',
);
assert(dealerNatural.seats['0'].results[0] === 'push', 'two naturals push');
assert(
  dealerNatural.seats['0'].chips === 200,
  'a natural push returns the stake',
);
assert(
  dealerNatural.seats['1'].results[0] === 'lose',
  'a dealer natural beats 19',
);
assert(dealerNatural.seats['1'].chips === 190, 'that loss keeps the stake');

const dealerHits = blackjackRules.applyIntent(
  acting(
    { '0': player(['10S', '7H'], 10, 190) },
    { dealer: ['10D', '6H'], deck: ['5C'] },
  ),
  { type: 'stand' },
  context(0),
);
assert(dealerHits.dealer.join() === '10D,6H,5C', 'the dealer hits 16');
assert(blackjackTotal(dealerHits.dealer) === 21, 'the drawn card makes 21');
assert(dealerHits.seats['0'].results[0] === 'lose', '17 loses to a dealer 21');

const soft = blackjackRules.applyIntent(
  acting(
    { '0': player(['10S', '8H'], 10, 190) },
    { dealer: ['AH', '6D'], deck: ['KS'] },
  ),
  { type: 'stand' },
  context(0),
);
assert(soft.dealer.length === 2, 'the dealer stands on a soft 17');
assert(soft.deck[0] === 'KS', 'the waiting card stays in the shoe');
assert(soft.seats['0'].results[0] === 'win', '18 beats a soft 17');

const doubled = blackjackRules.applyIntent(
  acting(
    { '0': player(['5S', '6H'], 10, 190) },
    { deck: ['10D'], dealer: ['10H', '7C'] },
  ),
  { type: 'double' },
  context(0),
);
assert(
  doubled.seats['0'].hands[0].cards.length === 3,
  'a double takes one card',
);
assert(doubled.seats['0'].hands[0].bet === 20, 'a double doubles the stake');
assert(doubled.seats['0'].results[0] === 'win', '21 beats 17 after a double');
assert(
  doubled.seats['0'].chips === 220,
  'a doubled win pays the doubled stake',
);

let badDouble = false;
try {
  blackjackRules.applyIntent(
    acting({ '0': player(['10S', '9H', '2C'], 10, 190) }),
    { type: 'double' },
    context(0),
  );
} catch (error) {
  badDouble = error instanceof Error && error.message === 'Invalid intent';
}
assert(badDouble, 'a double after more than two cards is rejected');

const split = blackjackRules.applyIntent(
  acting(
    { '0': player(['8S', '8H'], 10, 190) },
    { deck: ['2C', '3D', 'KS'], dealer: ['10D', '7H'] },
  ),
  { type: 'split' },
  context(0),
);
assert(split.phase === 'play', 'a split pair stays in play');
assert(split.seats['0'].hands.length === 2, 'a split makes two hands');
assert(
  split.seats['0'].hands[0].cards.join() === '8S,2C',
  'the first hand draws',
);
assert(
  split.seats['0'].hands[1].cards.join() === '8H,3D',
  'the second hand draws',
);
assert(split.seats['0'].chips === 180, 'a split posts a second stake');
assert(split.turnSeatIndex === 0, 'the splitter plays the first hand');
const splitNote = blackjackRules.eventNote(
  acting(
    { '0': player(['8S', '8H'], 10, 190) },
    { deck: ['2C', '3D', 'KS'], dealer: ['10D', '7H'] },
  ),
  { type: 'split' },
  split,
  context(0),
);
assert(
  splitNote !== null && splitNote.kind === 'split' && splitNote.seat === 0,
  'a split notes the seat',
);

let badSplit = false;
try {
  blackjackRules.applyIntent(
    acting({ '0': player(['10S', '9H'], 10, 190) }, { deck: ['2C', '3D'] }),
    { type: 'split' },
    context(0),
  );
} catch (error) {
  badSplit = error instanceof Error && error.message === 'Invalid intent';
}
assert(badSplit, 'unequal card values do not split');

const splitAces = blackjackRules.applyIntent(
  acting(
    { '0': player(['AS', 'AH'], 10, 190) },
    { deck: ['KD', '9C'], dealer: ['10S', '7H'] },
  ),
  { type: 'split' },
  context(0),
);
assert(
  splitAces.phase === 'finished',
  'split aces finish when they are the only seat',
);
assert(
  splitAces.seats['0'].hands[0].cards.join() === 'AS,KD',
  'the first ace draws one card',
);
assert(
  splitAces.seats['0'].hands[1].cards.join() === 'AH,9C',
  'the second ace draws one card',
);
assert(
  splitAces.seats['0'].results.join() === 'win,win',
  'each ace hand scores as an ordinary 21 or 20',
);
assert(
  splitAces.seats['0'].chips === 220,
  'two even-money wins pay both stakes',
);

let offTurn = false;
try {
  blackjackRules.applyIntent(
    acting(
      {
        '0': player(['10S', '8H'], 10, 190),
        '1': player(['9S', '7H'], 10, 190),
      },
      { turnSeatIndex: 0 },
    ),
    { type: 'stand' },
    context(1),
  );
} catch (error) {
  offTurn = error instanceof Error && error.message === 'Not your turn';
}
assert(offTurn, 'a stand from another seat is rejected');

const left = blackjackRules.onPlayerLeave(bought, seat(0));
assert(left.seats['0'] === undefined, 'a leaver leaves the betting round');
assert(left.turnSeatIndex === 2, 'the remaining seat bets');
assert(
  bought.seats['0'].bet === 0,
  'leaving does not change the previous state',
);

console.log(
  JSON.stringify({
    gameType: blackjackGameDefinition.gameType,
    emptyPhase: empty.phase,
    shoe: bought.deck.length,
    dealtHole: dealt.holeHidden,
    finished: finished.phase,
    winners: finished.winnerSeatIndexes,
    natural: natural.seats['0'].chips,
  }),
);
