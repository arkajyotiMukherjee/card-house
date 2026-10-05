import { stubGameDefinition, stubRules } from '../../src/shared/games/stub.ts';
import { registerGameRules, rulesByType } from './rules-by-type.ts';

const unknownGameType = 'unknown-game';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  rulesByType[stubGameDefinition.gameType] === undefined,
  'registry starts without the stub gameType',
);
assert(
  rulesByType[unknownGameType] === undefined,
  'unknown gameType is missing before registration',
);

registerGameRules(stubGameDefinition, stubRules);

const resolved = rulesByType[stubGameDefinition.gameType];
const unknown = rulesByType[unknownGameType];

assert(
  resolved === stubRules,
  'registered stub gameType resolves to the stub rules',
);
assert(unknown === undefined, 'unknown gameType does not resolve');
assert(unknown !== resolved, 'unknown gameType does not return the stub rules');

console.log(
  JSON.stringify({
    registeredGameType: stubGameDefinition.gameType,
    resolvedStubRules: resolved === stubRules,
    unknownGameType,
    unknownReturnedStubRules: unknown === stubRules,
  }),
);
