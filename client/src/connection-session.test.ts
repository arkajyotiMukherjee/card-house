import { describe, expect, it } from 'vitest';
import { CLIENT_ID_STORAGE_KEY } from './client-id';
import {
  beginOpen,
  decideLink,
  forgetSessionToken,
  IDLE_GAP_MS,
  linkStatusLine,
  readSessionToken,
  reconnectDelayMs,
  RECONNECT_MAX_DELAY_MS,
  RECONNECTING_LABEL,
  rememberSessionToken,
  SESSION_TOKEN_KEY,
  tokenFailure,
  type LinkState,
} from './connection-session';
import { THEME_STORAGE_KEY } from './theme';

function connected(token = 'issued-token'): LinkState {
  return {
    phase: 'connected',
    everConnected: true,
    attempt: 0,
    retryPending: false,
    opening: false,
    token,
  };
}

class MemoryStorage implements Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
> {
  private readonly values = new Map<string, string>();

  constructor(initial: Record<string, string>) {
    for (const [key, value] of Object.entries(initial)) {
      this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  keys(): string[] {
    return [...this.values.keys()];
  }
}

describe('reconnect delay', () => {
  it('backs off and then stops growing', () => {
    expect(reconnectDelayMs(0)).toBe(1_000);
    expect(reconnectDelayMs(1)).toBe(2_000);
    expect(reconnectDelayMs(2)).toBe(4_000);
    expect(reconnectDelayMs(20)).toBe(RECONNECT_MAX_DELAY_MS);
  });
});

describe('link status', () => {
  it('names only the reconnecting phase', () => {
    expect(linkStatusLine('reconnecting')).toBe(RECONNECTING_LABEL);
    expect(linkStatusLine('connected')).toBe('');
    expect(linkStatusLine('connecting')).toBe('');
    expect(linkStatusLine('error')).toBe('');
  });
});

describe('reconnect after the socket drops', () => {
  it('schedules a retry and keeps the identity token', () => {
    const decision = decideLink(connected(), { kind: 'dropped' });
    expect(decision.phase).toBe('reconnecting');
    expect(decision.openNow).toBe(false);
    expect(decision.delayMs).toBe(1_000);
    expect(decision.dropToken).toBe(false);
    expect(decision.token).toBe('issued-token');
    expect(decision.everConnected).toBe(true);
  });

  it('does not arm a second timer while one is already waiting', () => {
    const waiting = {
      ...connected(),
      phase: 'reconnecting' as const,
      retryPending: true,
    };
    const decision = decideLink(waiting, { kind: 'dropped' });
    expect(decision.delayMs).toBeUndefined();
    expect(decision.openNow).toBe(false);
    expect(decision.retryPending).toBe(true);
  });

  it('does not retry a first connect that never succeeded', () => {
    const decision = decideLink(
      {
        phase: 'connecting',
        everConnected: false,
        attempt: 0,
        retryPending: false,
        opening: true,
      },
      { kind: 'connect-failed', message: 'network down' },
    );
    expect(decision.phase).toBe('error');
    expect(decision.openNow).toBe(false);
    expect(decision.delayMs).toBeUndefined();
    expect(decision.everConnected).toBe(false);
  });

  it('opens immediately when the page returns from a long idle gap', () => {
    const idle = decideLink(connected(), {
      kind: 'resume',
      hiddenMs: IDLE_GAP_MS,
      socketClosed: false,
    });
    expect(idle.openNow).toBe(true);
    expect(idle.phase).toBe('reconnecting');
    expect(idle.dropToken).toBe(false);
    expect(idle.token).toBe('issued-token');

    const brief = decideLink(connected(), {
      kind: 'resume',
      hiddenMs: IDLE_GAP_MS - 1,
      socketClosed: false,
    });
    expect(brief.openNow).toBe(false);
    expect(brief.phase).toBe('connected');
  });

  it('opens immediately when the socket is already closed or a retry is waiting', () => {
    const closed = decideLink(connected(), {
      kind: 'resume',
      hiddenMs: 0,
      socketClosed: true,
    });
    expect(closed.openNow).toBe(true);

    const waiting = decideLink(
      { ...connected(), retryPending: true, phase: 'reconnecting' },
      { kind: 'resume', hiddenMs: 0, socketClosed: false },
    );
    expect(waiting.openNow).toBe(true);
    expect(waiting.attempt).toBe(0);
  });

  it('treats a hung reducer as a reason to open now', () => {
    const decision = decideLink(connected(), { kind: 'stale' });
    expect(decision.openNow).toBe(true);
    expect(decision.phase).toBe('reconnecting');
    expect(decision.token).toBe('issued-token');
  });

  it('ignores a stale signal while a socket is already opening', () => {
    const opening = beginOpen(connected());
    const decision = decideLink(opening, { kind: 'stale' });
    expect(decision.openNow).toBe(false);
    expect(decision.opening).toBe(true);
  });

  it('drops an expired token and connects again without touching other keys', () => {
    expect(tokenFailure('Failed to verify token: Unauthorized')).toBe(true);
    const decision = decideLink(connected('expired'), {
      kind: 'connect-failed',
      message: 'Failed to verify token: Unauthorized',
    });
    expect(decision.dropToken).toBe(true);
    expect(decision.token).toBeUndefined();
    expect(decision.openNow).toBe(true);
    expect(decision.everConnected).toBe(true);

    const storage = new MemoryStorage({
      [CLIENT_ID_STORAGE_KEY]: 'client-1',
      [THEME_STORAGE_KEY]:
        '{"clientId":"client-1","style":"purple","background":"red"}',
      [SESSION_TOKEN_KEY]: 'expired',
    });
    forgetSessionToken(storage);
    rememberSessionToken(storage, 'fresh');
    expect(storage.getItem(CLIENT_ID_STORAGE_KEY)).toBe('client-1');
    expect(storage.getItem(THEME_STORAGE_KEY)).toContain('purple');
    expect(storage.getItem(THEME_STORAGE_KEY)).toContain('red');
    expect(readSessionToken(storage)).toBe('fresh');
    expect(storage.keys().sort()).toEqual(
      [CLIENT_ID_STORAGE_KEY, SESSION_TOKEN_KEY, THEME_STORAGE_KEY].sort(),
    );
  });

  it('clears the backoff once the new socket is up', () => {
    const waiting = {
      ...connected(),
      phase: 'reconnecting' as const,
      attempt: 4,
      retryPending: true,
      opening: true,
    };
    const decision = decideLink(waiting, { kind: 'opened' });
    expect(decision.phase).toBe('connected');
    expect(decision.attempt).toBe(0);
    expect(decision.retryPending).toBe(false);
    expect(decision.opening).toBe(false);
    expect(decision.openNow).toBe(false);
  });
});
