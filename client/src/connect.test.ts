import { describe, expect, it } from 'vitest';
import {
  SERVER_UNREACHABLE,
  connectionLine,
  roomEntryError,
  sdkHost,
} from './connect';

describe('sdk host', () => {
  it('turns a websocket URI into the http URI the SDK opens itself', () => {
    expect(sdkHost('wss://maincloud.spacetimedb.com')).toBe(
      'https://maincloud.spacetimedb.com',
    );
    expect(sdkHost('ws://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(sdkHost('WSS://maincloud.spacetimedb.com')).toBe(
      'https://maincloud.spacetimedb.com',
    );
  });

  it('leaves an http URI and the dev default shape alone', () => {
    expect(sdkHost('https://maincloud.spacetimedb.com')).toBe(
      'https://maincloud.spacetimedb.com',
    );
    expect(sdkHost('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });
});

describe('connection status', () => {
  it('names a disconnected host without calling it an error', () => {
    expect(
      connectionLine(
        'disconnected',
        'https://maincloud.spacetimedb.com',
        'cardhouse',
      ),
    ).toBe(
      'SpacetimeDB: disconnected https://maincloud.spacetimedb.com / cardhouse',
    );
  });

  it('keeps an error detail on the status line', () => {
    expect(
      connectionLine('error', 'http://127.0.0.1:3000', 'cardroom', 'closed'),
    ).toBe('SpacetimeDB: error closed (http://127.0.0.1:3000 / cardroom)');
  });
});

describe('room entry', () => {
  it('blocks Create until the socket is up, and says when it failed', () => {
    expect(roomEntryError('connecting')).toBe('Still connecting to the server');
    expect(roomEntryError('connected')).toBeUndefined();
    expect(roomEntryError('disconnected')).toBe(SERVER_UNREACHABLE);
    expect(roomEntryError('error')).toBe(SERVER_UNREACHABLE);
    expect(SERVER_UNREACHABLE).toBe('Could not reach the server. Try again.');
  });
});
