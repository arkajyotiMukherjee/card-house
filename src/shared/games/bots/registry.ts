import { readBlackjackState } from '../blackjack.ts';
import { readBluffState } from '../bluff.ts';
import { readCrazyEightsState } from '../crazy-eights.ts';
import { readGoFishState } from '../go-fish.ts';
import { readHeartsState } from '../hearts.ts';
import { readPokerState } from '../poker.ts';
import { readPresidentState } from '../president.ts';
import { readRummyState } from '../rummy.ts';
import { readSpadesState } from '../spades.ts';
import { blackjackStrategy } from './blackjack.ts';
import { bluffStrategy } from './bluff.ts';
import { crazyEightsStrategy } from './crazy-eights.ts';
import { goFishStrategy } from './go-fish.ts';
import { heartsStrategy } from './hearts.ts';
import { pokerStrategy } from './poker.ts';
import { presidentStrategy } from './president.ts';
import { rummyStrategy } from './rummy.ts';
import { spadesStrategy } from './spades.ts';
import type { BotStrategy } from './types.ts';

function adapt<State, Intent>(
  strategy: BotStrategy<State, Intent>,
  read: (value: unknown) => State,
): BotStrategy<unknown, unknown> {
  return {
    gameType: strategy.gameType,
    actingSeats(state: unknown): number[] {
      return strategy.actingSeats(read(state));
    },
    choose(state: unknown, seatIndex: number): unknown {
      return strategy.choose(read(state), seatIndex);
    },
  };
}

const STRATEGIES: readonly BotStrategy<unknown, unknown>[] = [
  adapt(bluffStrategy, readBluffState),
  adapt(presidentStrategy, readPresidentState),
  adapt(goFishStrategy, readGoFishState),
  adapt(crazyEightsStrategy, readCrazyEightsState),
  adapt(rummyStrategy, readRummyState),
  adapt(blackjackStrategy, readBlackjackState),
  adapt(spadesStrategy, readSpadesState),
  adapt(heartsStrategy, readHeartsState),
  adapt(pokerStrategy, readPokerState),
];

const BY_TYPE: Record<string, BotStrategy<unknown, unknown>> = {};
for (const strategy of STRATEGIES) {
  BY_TYPE[strategy.gameType] = strategy;
}

export function strategyFor(
  gameType: string,
): BotStrategy<unknown, unknown> | undefined {
  return BY_TYPE[gameType];
}
