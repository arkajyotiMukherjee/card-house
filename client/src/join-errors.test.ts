import { describe, expect, it } from 'vitest';
import {
  joinFailureMessage,
  TABLE_ERROR_COLUMNS,
  wrapTableError,
} from './join-errors';

describe('joinFailureMessage', () => {
  it('gives a full table its own line', () => {
    expect(joinFailureMessage(new Error('Table is full'), 'x')).toBe(
      'Table is full. Pick another table.',
    );
  });

  it('gives a started game and an ended game their own lines', () => {
    const started = joinFailureMessage(new Error('Game already started'), 'x');
    const ended = joinFailureMessage(new Error('Game already ended'), 'x');
    expect(started).toBe('Game already started. Pick another table.');
    expect(ended).toBe('Game already ended. Pick another table.');
    expect(started).not.toBe(ended);
  });

  it('gives a closed room its own line', () => {
    expect(joinFailureMessage(new Error('Room closed'), 'x')).toBe(
      'This room is closed. Ask for a new code.',
    );
  });

  it('keeps unknown module text and falls back when there is none', () => {
    expect(joinFailureMessage(new Error('Room not found'), 'x')).toBe(
      'Room not found',
    );
    expect(joinFailureMessage('boom', 'Could not join')).toBe('Could not join');
  });
});

describe('wrapTableError', () => {
  it('fits every join message in the table-list box', () => {
    for (const raw of [
      'Table is full',
      'Game already started',
      'Game already ended',
      'Room closed',
    ]) {
      const wrapped = wrapTableError(joinFailureMessage(new Error(raw), 'x'));
      for (const line of wrapped.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(TABLE_ERROR_COLUMNS);
      }
    }
  });
});
