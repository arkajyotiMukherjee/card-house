import { strategyFor } from '../../src/shared/games/bots/registry.ts';

/** Intents one catch-up call may apply. A live table applies one per beat. */
export const BOT_TURN_CAP = 32;

/** Gap between bot plays, so each one arrives as its own update. */
export const BOT_BEAT_MICROS = 800_000n;

/** How long a finished poker hand stays up before the next deal. */
export const POKER_HAND_PAUSE_MICROS = 5_000_000n;

/**
 * Delay before the next scheduled beat.
 * A bot action and a poker street stay on the 800ms beat.
 * A finished hand waits the full pause, so the winner can be read.
 */
export function tableBeatDelay(kind: 'bot' | 'street' | 'hand'): bigint {
  if (kind === 'hand') {
    return POKER_HAND_PAUSE_MICROS;
  }
  return BOT_BEAT_MICROS;
}

export interface BotActor {
  seatIndex: number;
  isBot: boolean;
}

export interface AppliedBotIntent {
  seatIndex: number;
  intent: unknown;
  before: unknown;
  after: unknown;
}

export interface BotTurnBatch {
  state: unknown;
  applied: AppliedBotIntent[];
  /** True when a bot still has to act after the cap. */
  pending: boolean;
  /** Set when a strategy or intent failed. Earlier applies stay. */
  error?: string;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Bot intent rejected';
}

function isBotSeat(actors: readonly BotActor[], seatIndex: number): boolean {
  for (const actor of actors) {
    if (actor.seatIndex === seatIndex) {
      return actor.isBot;
    }
  }
  return false;
}

/** True when the next actor is a bot. A person's turn is not one of these. */
export function botIsNext(
  gameType: string,
  state: unknown,
  actors: readonly BotActor[],
): boolean {
  const strategy = strategyFor(gameType);
  if (!strategy) {
    return false;
  }
  try {
    const next = strategy.actingSeats(state)[0];
    return next !== undefined && isBotSeat(actors, next);
  } catch {
    return false;
  }
}

/**
 * Plays bot seats until the next actor is a person, the hand is over,
 * or the step limit is reached. One thrown intent stops the loop and is
 * reported. The live schedule passes `1` so each play is its own update.
 */
export function playBotTurns(
  gameType: string,
  state: unknown,
  actors: readonly BotActor[],
  apply: (state: unknown, intent: unknown, seatIndex: number) => unknown,
  stepLimit = BOT_TURN_CAP,
): BotTurnBatch {
  const strategy = strategyFor(gameType);
  if (!strategy) {
    return { state, applied: [], pending: false };
  }
  let current = state;
  const applied: AppliedBotIntent[] = [];
  const steps = stepLimit < 1 ? 0 : stepLimit;
  for (let step = 0; step < steps; step += 1) {
    let seats: number[];
    try {
      seats = strategy.actingSeats(current);
    } catch (err) {
      return { state: current, applied, pending: false, error: message(err) };
    }
    const next = seats[0];
    if (next === undefined || !isBotSeat(actors, next)) {
      return { state: current, applied, pending: false };
    }
    try {
      const intent = strategy.choose(current, next);
      const after = apply(current, intent, next);
      applied.push({ seatIndex: next, intent, before: current, after });
      current = after;
    } catch (err) {
      return { state: current, applied, pending: false, error: message(err) };
    }
  }
  try {
    const seats = strategy.actingSeats(current);
    const next = seats[0];
    return {
      state: current,
      applied,
      pending: next !== undefined && isBotSeat(actors, next),
    };
  } catch (err) {
    return { state: current, applied, pending: false, error: message(err) };
  }
}
