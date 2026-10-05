import type { GameDefinition } from './game-definition';
import type {
  GameRules,
  GameSeat,
  GameTable,
  IntentContext,
} from './game-rules';

/** Fixture so typecheck can see a value for each shared game type. */
export const stubGameDefinition = {
  gameType: 'stub',
  displayName: 'Stub',
  minPlayers: 2,
  maxPlayers: 4,
  howToPlay: '# Stub\n\nTypecheck fixture for the shared game definition.',
} satisfies GameDefinition;

interface StubState {
  label: string;
}

type StubIntent = {
  type: 'stub';
};

/** Fixture so typecheck can see a value for `GameRules`. */
export const stubRules = {
  initialState(players: GameSeat[], table: GameTable): StubState {
    void players;
    void table;
    return { label: 'stub' };
  },
  applyIntent(
    prev: StubState,
    intent: StubIntent,
    ctx: IntentContext,
  ): StubState {
    void intent;
    void ctx;
    return prev;
  },
  onPlayerJoin(prev: StubState, seat: GameSeat): StubState {
    void seat;
    return prev;
  },
  onPlayerLeave(prev: StubState, seat: GameSeat): StubState {
    void seat;
    return prev;
  },
  isJoinAllowedDuringPhase(state: StubState): boolean {
    void state;
    return false;
  },
  isTableReadyToStart(state: StubState): boolean {
    void state;
    return false;
  },
} satisfies GameRules<StubState, StubIntent>;
