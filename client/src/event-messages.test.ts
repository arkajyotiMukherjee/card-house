import { describe, expect, it } from 'vitest';
import { eventMessage, readStoredEvent } from './event-messages';

const names = (seat: number): string => ['Ada', 'Bea'][seat] ?? `Seat ${seat}`;

describe('stored event', () => {
  it('reads the order and note from payloadJson', () => {
    expect(
      readStoredEvent(
        JSON.stringify({ order: 3, intent: {}, note: { kind: 'play' } }),
      ),
    ).toEqual({ order: 3, note: { kind: 'play' } });
  });

  it('has no note for a plain intent event', () => {
    expect(
      readStoredEvent(
        JSON.stringify({ order: 0, intent: { type: 'increment' } }),
      ),
    ).toEqual({ order: 0, note: null });
  });

  it('rejects malformed payloads', () => {
    expect(readStoredEvent('not json')).toBeNull();
    expect(readStoredEvent('[]')).toBeNull();
    expect(readStoredEvent('{"intent":{}}')).toBeNull();
  });
});

describe('eventMessage', () => {
  it('announces a called bluff that caught a lie', () => {
    expect(
      eventMessage(
        'bluff',
        {
          kind: 'challenge',
          challenger: 1,
          accused: 0,
          bluff: true,
          pickedUp: 0,
        },
        names,
      ),
    ).toBe('Bea called bluff! Ada lied and takes the pile');
  });

  it('announces a called bluff on an honest play', () => {
    expect(
      eventMessage(
        'bluff',
        {
          kind: 'challenge',
          challenger: 1,
          accused: 0,
          bluff: false,
          pickedUp: 1,
        },
        names,
      ),
    ).toBe('Bea called bluff but Ada was honest. Bea takes the pile');
  });

  it('announces a play', () => {
    expect(
      eventMessage(
        'bluff',
        { kind: 'play', seat: 0, count: 2, claimRank: '5' },
        names,
      ),
    ).toBe('Ada played 2 cards as 5');
    expect(
      eventMessage(
        'bluff',
        { kind: 'play', seat: 0, count: 1, claimRank: 'A' },
        names,
      ),
    ).toBe('Ada played 1 card as A');
  });

  it('announces a President play, pass, and finish', () => {
    expect(
      eventMessage(
        'president',
        { kind: 'play', seat: 0, count: 2, rank: 'K' },
        names,
      ),
    ).toBe('Ada played 2 cards of K');
    expect(eventMessage('president', { kind: 'pass', seat: 1 }, names)).toBe(
      'Bea passed',
    );
    expect(
      eventMessage(
        'president',
        { kind: 'finish', president: 0, scum: 1 },
        names,
      ),
    ).toBe('Ada is President. Bea is Scum');
  });

  it('announces a Crazy Eights play, draw, and win', () => {
    expect(
      eventMessage(
        'crazy_eights',
        { kind: 'play', seat: 0, card: '8H', suit: 'D' },
        names,
      ),
    ).toBe('Ada played an 8, suit Diamonds');
    expect(
      eventMessage(
        'crazy_eights',
        { kind: 'play', seat: 1, card: '5S', suit: 'S' },
        names,
      ),
    ).toBe('Bea played 5S');
    expect(eventMessage('crazy_eights', { kind: 'draw', seat: 0 }, names)).toBe(
      'Ada draws',
    );
    expect(
      eventMessage(
        'crazy_eights',
        { kind: 'finish', seat: 0, score: 63 },
        names,
      ),
    ).toBe('Ada wins, score 63');
  });

  it('announces a rummy draw, meld, and going out', () => {
    expect(
      eventMessage('rummy', { kind: 'draw', seat: 0, source: 'stock' }, names),
    ).toBe('Ada drew from the stock');
    expect(
      eventMessage(
        'rummy',
        { kind: 'meld', seat: 1, count: 3, out: false },
        names,
      ),
    ).toBe('Bea melded 3 cards');
    expect(
      eventMessage(
        'rummy',
        {
          kind: 'discard',
          seat: 0,
          out: true,
          ended: false,
          winnerSeatIndex: 0,
        },
        names,
      ),
    ).toBe('Ada discarded and went out');
  });

  it('announces a blackjack bet, hit, and bust', () => {
    expect(
      eventMessage('blackjack', { kind: 'bet', seat: 0, amount: 25 }, names),
    ).toBe('Ada bets 25');
    expect(
      eventMessage(
        'blackjack',
        { kind: 'hit', seat: 1, total: 16, bust: false },
        names,
      ),
    ).toBe('Bea hits 16');
    expect(
      eventMessage(
        'blackjack',
        { kind: 'hit', seat: 0, total: 24, bust: true },
        names,
      ),
    ).toBe('Ada busts');
    expect(
      eventMessage('blackjack', { kind: 'stand', seat: 0, total: 18 }, names),
    ).toBe('Ada stands on 18');
    expect(eventMessage('blackjack', { kind: 'split', seat: 1 }, names)).toBe(
      'Bea splits',
    );
  });

  it('announces a Spades bid, trick, and winning score', () => {
    expect(
      eventMessage('spades', { kind: 'bid', seat: 0, tricks: 0 }, names),
    ).toBe('Ada bid nil');
    expect(
      eventMessage('spades', { kind: 'bid', seat: 1, tricks: 3 }, names),
    ).toBe('Bea bid 3');
    expect(eventMessage('spades', { kind: 'trick', winner: 1 }, names)).toBe(
      'Bea won the trick',
    );
    expect(
      eventMessage(
        'spades',
        { kind: 'hand', ns: 600, ew: -20, winner: 'ns' },
        names,
      ),
    ).toBe('NS wins 600 to -20');
  });

  it('announces a hearts pass, the queen, and the winner', () => {
    expect(
      eventMessage(
        'hearts',
        { kind: 'pass', seat: 0, direction: 'left' },
        names,
      ),
    ).toBe('Ada passed 3 left');
    expect(
      eventMessage(
        'hearts',
        {
          kind: 'play',
          seat: 1,
          card: 'QS',
          trickWinner: 1,
          points: 13,
          queen: true,
        },
        names,
      ),
    ).toBe('Bea played QS. Bea takes the queen');
    expect(eventMessage('hearts', { kind: 'finished', winner: 0 }, names)).toBe(
      'Ada wins',
    );
  });

  it('keeps dummy and unknown events silent', () => {
    expect(eventMessage('dummy', null, names)).toBeNull();
    expect(eventMessage('bluff', null, names)).toBeNull();
    expect(eventMessage('bluff', { kind: 'nope' }, names)).toBeNull();
    expect(eventMessage('go_fish', null, names)).toBeNull();
  });

  it('announces a Go Fish ask', () => {
    expect(
      eventMessage(
        'go_fish',
        { kind: 'ask', from: 0, to: 1, rank: 'K', given: 2, drawn: false },
        names,
      ),
    ).toBe('Ada took 2 K from Bea');
    expect(
      eventMessage(
        'go_fish',
        { kind: 'ask', from: 1, to: 0, rank: 'A', given: 0, drawn: true },
        names,
      ),
    ).toBe('Bea asked Ada for A. Go fish');
  });
});
