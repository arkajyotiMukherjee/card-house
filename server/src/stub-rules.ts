import { SenderError } from 'spacetimedb/server';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from '../../src/shared/games';

interface StubState {
  label: string;
}

const STUB_INTENT = 'stub';

function stubState(value: unknown): StubState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SenderError('Invalid table state');
  }
  if (!('label' in value) || typeof value.label !== 'string') {
    throw new SenderError('Invalid table state');
  }
  if (value.label.length === 0) {
    throw new SenderError('Invalid table state');
  }
  return { label: value.label };
}

function stubIntent(value: unknown): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SenderError('Invalid intent');
  }
  if (!('type' in value) || value.type !== STUB_INTENT) {
    throw new SenderError('Invalid intent');
  }
}

/**
 * Rules for the `stub` gameType.
 * A valid intent rewrites `label` with the seated player's seat index.
 */
export const stubIntentRules = {
  initialState(_players: GameSeat[], _table: GameTable): StubState {
    return { label: 'stub' };
  },
  applyIntent(prev: unknown, intent: unknown, ctx: IntentContext): StubState {
    const state = stubState(prev);
    stubIntent(intent);
    return { label: `${state.label}#${ctx.seat.seatIndex}` };
  },
} satisfies GameRules<unknown, unknown>;
