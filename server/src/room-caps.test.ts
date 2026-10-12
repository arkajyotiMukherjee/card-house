import { dummyGameDefinition } from '../../src/shared/games/dummy-counter.ts';
import { heartsGameDefinition } from '../../src/shared/games/hearts.ts';
import {
  DEFAULT_ROOM_CAPS,
  joinSeatRejection,
  lobbyCapRejection,
  roomCapsRejection,
  tableCapRejection,
  tableSeatLimits,
  type RoomCaps,
} from './room-caps.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const devCaps: RoomCaps = {
  maxLobbies: 1,
  maxTablesPerLobby: 1,
  maxSeatsPerTable: 1,
};

assert(
  roomCapsRejection(DEFAULT_ROOM_CAPS) === undefined,
  'defaults are valid',
);
assert(
  roomCapsRejection({ ...DEFAULT_ROOM_CAPS, maxLobbies: 0 }) ===
    'maxLobbies must be a positive integer',
  'a zero lobby cap is rejected',
);

assert(
  lobbyCapRejection(0, devCaps) === undefined,
  'the first lobby fits a cap of 1',
);
assert(
  lobbyCapRejection(1, devCaps) === 'Lobby cap reached',
  'the second lobby is past a cap of 1',
);
assert(
  lobbyCapRejection(1, { ...devCaps, maxLobbies: 2 }) === undefined,
  'raising the lobby cap allows the next lobby',
);

assert(
  tableCapRejection(0, devCaps) === undefined,
  'the first table fits a cap of 1',
);
assert(
  tableCapRejection(1, devCaps) === 'Table cap reached',
  'the second table is past a cap of 1',
);
assert(
  tableCapRejection(1, { ...devCaps, maxTablesPerLobby: 2 }) === undefined,
  'raising the table cap allows the next table',
);

const hearts = {
  minPlayers: heartsGameDefinition.minPlayers,
  maxPlayers: heartsGameDefinition.maxPlayers,
};
const looseSeats: RoomCaps = {
  ...DEFAULT_ROOM_CAPS,
  maxSeatsPerTable: hearts.maxPlayers + 4,
};
const kept = tableSeatLimits(hearts, {}, looseSeats);
assert(!('error' in kept), 'hearts seats resolve under a looser cap');
if (!('error' in kept)) {
  assert(
    kept.maxPlayers === heartsGameDefinition.maxPlayers,
    'a looser seat cap does not raise the hearts seat count',
  );
  assert(
    kept.minPlayers === heartsGameDefinition.minPlayers,
    'hearts keeps its catalog minimum',
  );
}

const raised = tableSeatLimits(
  hearts,
  { maxPlayers: heartsGameDefinition.maxPlayers + 2 },
  looseSeats,
);
assert(
  'error' in raised && raised.error === 'maxPlayers exceeds this game',
  'a request above the catalog seat count is rejected',
);

const dummy = {
  minPlayers: dummyGameDefinition.minPlayers,
  maxPlayers: dummyGameDefinition.maxPlayers,
};
const overSeatCap = tableSeatLimits(
  dummy,
  { minPlayers: 1, maxPlayers: 2 },
  devCaps,
);
assert(
  'error' in overSeatCap && overSeatCap.error === 'Seat cap reached',
  'a seat count above the cap is rejected',
);
const withinSeatCap = tableSeatLimits(
  dummy,
  { minPlayers: 1, maxPlayers: 1 },
  devCaps,
);
assert(
  !('error' in withinSeatCap) && withinSeatCap.maxPlayers === 1,
  'a seat count at the cap is accepted',
);

assert(
  joinSeatRejection(0, 6, devCaps) === undefined,
  'the first seat fits a cap of 1',
);
assert(
  joinSeatRejection(1, 6, devCaps) === 'Seat cap reached',
  'the next seat is past the seat cap',
);
assert(
  joinSeatRejection(1, 6, { ...devCaps, maxSeatsPerTable: 8 }) === undefined,
  'raising the seat cap allows another seat under the table max',
);
assert(
  joinSeatRejection(6, 6, DEFAULT_ROOM_CAPS) === 'Table is full',
  'a full table still reports the table max',
);

console.log(
  JSON.stringify({
    defaultCaps: DEFAULT_ROOM_CAPS,
    heartsMax: heartsGameDefinition.maxPlayers,
    looseCap: looseSeats.maxSeatsPerTable,
    keptHeartsMax: 'error' in kept ? kept.error : kept.maxPlayers,
  }),
);
