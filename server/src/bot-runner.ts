import { strategyFor } from '../../src/shared/games/bots/registry.ts';

/** Intents applied in one reducer call. The rest wait for the schedule. */
export const BOT_TURN_CAP = 32;

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

/**
 * Plays bot seats until the next actor is a person, the hand is over,
 * or the cap is reached. One thrown intent stops the loop and is reported.
 */
export function playBotTurns(
  gameType: string,
  state: unknown,
  actors: readonly BotActor[],
  apply: (state: unknown, intent: unknown, seatIndex: number) => unknown,
): BotTurnBatch {
  const strategy = strategyFor(gameType);
  if (!strategy) {
    return { state, applied: [], pending: false };
  }
  let current = state;
  const applied: AppliedBotIntent[] = [];
  for (let step = 0; step < BOT_TURN_CAP; step += 1) {
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
