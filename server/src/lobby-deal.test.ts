import type { GameSeat, GameTable } from '../../src/shared/games/game-rules.ts';
import { bluffRules } from '../../src/shared/games/bluff.ts';
import { stateIfLobbyReady } from './lobby-deal.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const table: GameTable = {
  id: 'table-bluff',
  lobbyId: 'lobby-1',
  gameType: 'bluff',
  name: 'Bluff #1',
  status: 'waiting_for_players',
  minPlayers: 2,
  maxPlayers: 6,
  stateJson: '{}',
  createdAt: 1,
};

function seat(seatIndex: number): GameSeat {
  return {
    id: `seat-${seatIndex}`,
    tableId: table.id,
    lobbyMemberId: `member-${seatIndex}`,
    seatIndex,
    chips: null,
    joinedAt: 1,
    seatState: 'active',
  };
}

const lobby = bluffRules.initialState([], table);
assert(lobby.phase === 'lobby', 'an empty Bluff table stays in the lobby');
assert(
  stateIfLobbyReady(JSON.stringify(lobby), 1, 2) === 'keep',
  'one seat does not deal',
);
assert(
  stateIfLobbyReady(JSON.stringify(lobby), 2, 2) === 'deal',
  'two seats deal a lobby table',
);
assert(
  stateIfLobbyReady('{"count":0}', 2, 1) === 'keep',
  'a dummy counter has no lobby phase',
);
assert(
  stateIfLobbyReady('{"label":"stub"}', 2, 2) === 'keep',
  'a stub table has no lobby phase',
);
assert(
  stateIfLobbyReady('{"phase":"play","hands":{}}', 2, 2) === 'keep',
  'a started table is not dealt again',
);

const dealt = bluffRules.initialState([seat(0), seat(1)], table);
assert(dealt.phase === 'play', 'dealing leaves the lobby');
const dealtCards =
  (dealt.hands['0']?.length ?? 0) + (dealt.hands['1']?.length ?? 0);
assert(dealtCards === 52, 'both seats are dealt the deck');
assert(dealt.discardPile.length === 0, 'the pile starts empty');
assert(dealt.turnSeatIndex === 0, 'the first seat acts');

console.log(
  JSON.stringify({
    lobbyPhase: lobby.phase,
    dealtPhase: dealt.phase,
    seat0: dealt.hands['0']?.length,
    seat1: dealt.hands['1']?.length,
  }),
);
