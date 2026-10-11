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
  });
});
