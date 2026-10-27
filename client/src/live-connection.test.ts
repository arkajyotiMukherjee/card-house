import { describe, expect, it, vi } from 'vitest';
import { RECONNECTING_LABEL } from './connection-session';
import { LiveConnection, type SocketLike } from './live-connection';

interface FakeSocket {
  socket: SocketLike;
  inserted: Record<string, unknown[]>;
  subscriptions: unknown[];
  calls: Array<{ name: string; args: unknown }>;
}

function fakeSocket(hang = false): FakeSocket {
  const inserted: Record<string, unknown[]> = {};
  const subscriptions: unknown[] = [];
  const calls: Array<{ name: string; args: unknown }> = [];
  const socket: SocketLike = {
    isActive: true,
    isSocketClosed: false,
    db: new Proxy({} as SocketLike['db'], {
      get: (_target, table: string | symbol) => {
        if (typeof table !== 'string') {
          return undefined;
        }
        return {
          onInsert: (cb: unknown) => {
            const key = `${table}:insert`;
            inserted[key] = inserted[key] ?? [];
            inserted[key].push(cb);
          },
          onUpdate: (cb: unknown) => {
            const key = `${table}:update`;
            inserted[key] = inserted[key] ?? [];
            inserted[key].push(cb);
          },
          onDelete: (cb: unknown) => {
            const key = `${table}:delete`;
            inserted[key] = inserted[key] ?? [];
            inserted[key].push(cb);
          },
          iter: () => [],
        };
      },
    }),
    reducers: new Proxy({} as SocketLike['reducers'], {
      get: (_target, name: string | symbol) => {
        if (typeof name !== 'string') {
          return undefined;
        }
        return (args: unknown) => {
          calls.push({ name, args });
          if (hang) {
            return new Promise<void>(() => {});
          }
          return Promise.resolve();
        };
      },
    }),
    subscriptionBuilder: () => {
      let applied: ((ctx: unknown) => void) | undefined;
      const builder = {
        onApplied: (cb: (ctx: unknown) => void) => {
          applied = cb;
          return builder;
        },
        onError: () => builder,
        subscribe: (query: unknown) => {
          subscriptions.push(query);
          applied?.({ event: { tag: 'SubscribeApplied' } });
          return {
            unsubscribe: () => {},
            isActive: () => true,
            isEnded: () => false,
          };
        },
      };
      return builder;
    },
  };
  return { socket, inserted, subscriptions, calls };
}

describe('live connection reconnect', () => {
  it('sends open subscriptions and row listeners to the next socket', () => {
    const live = new LiveConnection(() => {});
    const first = fakeSocket();
    live.attach(first.socket);
    live.db.gameTable?.onInsert?.(() => {});
    const applied: string[] = [];
    const handle = live
      .subscriptionBuilder()
      .onApplied(() => {
        applied.push('applied');
      })
      .subscribe('SELECT * FROM GameTable');
    expect(applied).toEqual(['applied']);
    expect(first.subscriptions).toEqual(['SELECT * FROM GameTable']);
    expect(first.inserted['gameTable:insert']).toHaveLength(1);

    live.detach();
    const second = fakeSocket();
    live.attach(second.socket);
    expect(second.subscriptions).toEqual(['SELECT * FROM GameTable']);
    expect(second.inserted['gameTable:insert']).toHaveLength(1);
    expect(applied).toEqual(['applied', 'applied']);
    expect(handle.isEnded()).toBe(false);
  });

  it('does not replay a subscription that was closed', () => {
    const live = new LiveConnection(() => {});
    live.attach(fakeSocket().socket);
    const handle = live.subscriptionBuilder().subscribe('SELECT 1');
    handle.unsubscribe();
    const second = fakeSocket();
    live.detach();
    live.attach(second.socket);
    expect(second.subscriptions).toEqual([]);
  });

  it('rejects a reducer on a dead socket and uses the socket from the next attach', async () => {
    const stale = vi.fn();
    const live = new LiveConnection(stale);
    const first = fakeSocket();
    live.attach(first.socket);
    await live.reducers.joinLobby?.({ lobbyCode: 'ABCD' });
    expect(first.calls).toEqual([
      { name: 'joinLobby', args: { lobbyCode: 'ABCD' } },
    ]);

    live.detach();
    await expect(live.reducers.joinLobby?.({})).rejects.toThrow(
      RECONNECTING_LABEL,
    );
    expect(stale).toHaveBeenCalled();

    const second = fakeSocket();
    live.attach(second.socket);
    await live.reducers.handleGameIntent?.({
      tableId: 't1',
      clientId: 'c1',
      intentPayload: '{}',
    });
    expect(second.calls).toEqual([
      {
        name: 'handleGameIntent',
        args: { tableId: 't1', clientId: 'c1', intentPayload: '{}' },
      },
    ]);
    expect(first.calls).toHaveLength(1);
  });

  it('treats a reducer that never settles as a dead socket', async () => {
    vi.useFakeTimers();
    const stale = vi.fn();
    const live = new LiveConnection(stale, 20);
    live.attach(fakeSocket(true).socket);
    const pending = live.reducers.handleGameIntent?.({ tableId: 't1' });
    const rejected = expect(pending).rejects.toThrow(RECONNECTING_LABEL);
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
    expect(stale).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
