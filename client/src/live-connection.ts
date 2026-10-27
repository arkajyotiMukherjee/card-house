import { REDUCER_TIMEOUT_MS, RECONNECTING_LABEL } from './connection-session';

/**
 * One stable connection object for the scenes.
 *
 * Game, lobby, and menu keep the object they were given. When the socket dies,
 * a new `DbConnection` is attached here: row listeners are registered again and
 * open subscriptions are sent again. Reducer calls go to the live socket, or
 * reject immediately so a click cannot sit forever on a closed one.
 */

type RowCallback = (...args: never[]) => void;

interface RowHooks {
  onInsert: RowCallback[];
  onUpdate: RowCallback[];
  onDelete: RowCallback[];
}

interface TableLike {
  onInsert?: (cb: RowCallback) => void;
  onUpdate?: (cb: RowCallback) => void;
  onDelete?: (cb: RowCallback) => void;
  iter?: () => Iterable<unknown>;
}

interface SdkSubscription {
  unsubscribe: () => void;
  isActive: () => boolean;
  isEnded: () => boolean;
}

interface BuilderLike {
  onApplied: (cb: (ctx: unknown) => void) => BuilderLike;
  onError: (cb: (ctx: unknown) => void) => BuilderLike;
  subscribe: (query: unknown) => SdkSubscription;
}

export interface SocketLike {
  isActive: boolean;
  readonly isSocketClosed: boolean;
  identity?: { toHexString: () => string };
  db: Record<string, TableLike | undefined>;
  reducers: Record<string, (args: unknown) => Promise<void>>;
  subscriptionBuilder: () => BuilderLike;
}

interface ReducerMap {
  [name: string]: (args: unknown) => Promise<void>;
}

interface DbMap {
  [name: string]: TableLike;
}

const HOOK_METHODS = ['onInsert', 'onUpdate', 'onDelete'] as const;
type HookMethod = (typeof HOOK_METHODS)[number];

interface LiveSubscriptionBuilder {
  onApplied: (cb: (ctx: unknown) => void) => LiveSubscriptionBuilder;
  onError: (cb: (ctx: unknown) => void) => LiveSubscriptionBuilder;
  subscribe: (query: unknown) => TrackedQuery['handle'];
}

class TrackedQuery {
  ended = false;
  private sdk: SdkSubscription | undefined;

  constructor(
    readonly query: unknown,
    private readonly applied: ((ctx: unknown) => void) | undefined,
    private readonly failed: ((ctx: unknown) => void) | undefined,
  ) {}

  readonly handle = {
    isEnded: (): boolean => this.ended,
    isActive: (): boolean => !this.ended && this.sdk?.isActive() === true,
    unsubscribe: (): void => {
      if (this.ended) {
        throw new Error('Unsubscribe has already been called');
      }
      this.ended = true;
      const sdk = this.sdk;
      this.sdk = undefined;
      if (!sdk || sdk.isEnded()) {
        return;
      }
      try {
        sdk.unsubscribe();
      } catch {
        // The socket is already gone.
      }
    },
  };

  release(): void {
    this.sdk = undefined;
  }

  open(socket: SocketLike | undefined): void {
    if (!socket || this.ended) {
      return;
    }
    this.sdk = undefined;
    let builder = socket.subscriptionBuilder();
    if (this.applied) {
      const applied = this.applied;
      builder = builder.onApplied((ctx) => {
        applied(ctx);
      });
    }
    if (this.failed) {
      const failed = this.failed;
      builder = builder.onError((ctx) => {
        failed(ctx);
      });
    }
    this.sdk = builder.subscribe(this.query);
  }
}

export class LiveConnection {
  readonly db: DbMap;
  readonly reducers: ReducerMap;

  private socket: SocketLike | undefined;
  private readonly hooks = new Map<string, RowHooks>();
  private readonly queries: TrackedQuery[] = [];

  constructor(
    private readonly onStale: () => void,
    private readonly reducerTimeoutMs = REDUCER_TIMEOUT_MS,
  ) {
    this.db = new Proxy({} as DbMap, {
      get: (_target, name) => {
        if (typeof name !== 'string') {
          return undefined;
        }
        return this.table(name);
      },
    });
    this.reducers = new Proxy({} as ReducerMap, {
      get: (_target, name) => {
        if (typeof name !== 'string') {
          return undefined;
        }
        return (args: unknown) => this.callReducer(name, args);
      },
    });
  }

  get isActive(): boolean {
    return (
      this.socket?.isActive === true && this.socket.isSocketClosed !== true
    );
  }

  get identity(): { toHexString: () => string } | undefined {
    return this.socket?.identity;
  }

  attach(socket: SocketLike): void {
    this.socket = socket;
    this.bindAll(socket);
    this.replayAll(socket);
  }

  /** Drops the current socket. Listeners and open subscriptions stay recorded. */
  detach(): void {
    this.socket = undefined;
    for (const query of this.queries) {
      query.release();
    }
  }

  subscriptionBuilder(): LiveSubscriptionBuilder {
    let applied: ((ctx: unknown) => void) | undefined;
    let failed: ((ctx: unknown) => void) | undefined;
    const builder = {
      onApplied: (cb: (ctx: unknown) => void) => {
        applied = cb;
        return builder;
      },
      onError: (cb: (ctx: unknown) => void) => {
        failed = cb;
        return builder;
      },
      subscribe: (query: unknown) => {
        const tracked = new TrackedQuery(query, applied, failed);
        this.queries.push(tracked);
        tracked.open(this.socket);
        return tracked.handle;
      },
    };
    return builder;
  }

  private table(name: string): TableLike {
    return {
      onInsert: (cb) => {
        this.watch(name, 'onInsert', cb);
      },
      onUpdate: (cb) => {
        this.watch(name, 'onUpdate', cb);
      },
      onDelete: (cb) => {
        this.watch(name, 'onDelete', cb);
      },
      iter: () => {
        const table = this.socket?.db[name];
        if (!table?.iter) {
          return [];
        }
        return table.iter();
      },
    };
  }

  private watch(name: string, method: HookMethod, cb: RowCallback): void {
    this.hooksFor(name)[method].push(cb);
    this.socket?.db[name]?.[method]?.(cb);
  }

  private hooksFor(name: string): RowHooks {
    const existing = this.hooks.get(name);
    if (existing) {
      return existing;
    }
    const created: RowHooks = { onInsert: [], onUpdate: [], onDelete: [] };
    this.hooks.set(name, created);
    return created;
  }

  private bindAll(socket: SocketLike): void {
    for (const [name, hooks] of this.hooks) {
      const table = socket.db[name];
      if (!table) {
        continue;
      }
      for (const method of HOOK_METHODS) {
        const register = table[method];
        if (!register) {
          continue;
        }
        for (const cb of hooks[method]) {
          register(cb);
        }
      }
    }
  }

  private replayAll(socket: SocketLike): void {
    for (const query of this.queries) {
      query.open(socket);
    }
  }

  private callReducer(name: string, args: unknown): Promise<void> {
    const socket = this.socket;
    if (!socket || !socket.isActive || socket.isSocketClosed) {
      this.onStale();
      return Promise.reject(new Error(RECONNECTING_LABEL));
    }
    const call = socket.reducers[name];
    if (!call) {
      this.onStale();
      return Promise.reject(new Error(RECONNECTING_LABEL));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.onStale();
        reject(new Error(RECONNECTING_LABEL));
      }, this.reducerTimeoutMs);
      Promise.resolve(call(args)).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
