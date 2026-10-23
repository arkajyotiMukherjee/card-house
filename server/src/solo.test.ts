import {
  botClientId,
  botIntentRejection,
  botName,
  soloJoinRejection,
  soloLeaveRemovesRoom,
} from './solo.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

assert(botClientId('table-1', 2) === 'bot:table-1:2', 'bot client id');
assert(botName(1) === 'Ada', 'first bot name');
assert(botName(7) === 'Gus', 'last listed bot name');
assert(botName(8) === 'Bot', 'a seat past the list');

assert(
  soloJoinRejection(true, false) === 'Room is private',
  'a second client cannot join a solo room',
);
assert(
  soloJoinRejection(true, true) === undefined,
  'the starter can rejoin their solo room',
);
assert(
  soloJoinRejection(false, false) === undefined,
  'a shared room still accepts a new member',
);

assert(
  botIntentRejection(true) === 'Bot seats play on their own',
  'a client cannot submit a bot intent',
);
assert(
  botIntentRejection(false) === undefined,
  'a person can submit their own intent',
);

assert(
  soloLeaveRemovesRoom(true, false) === true,
  'the human leaving removes the solo room',
);
assert(
  soloLeaveRemovesRoom(true, true) === false,
  'a bot leaving does not remove the room',
);
assert(
  soloLeaveRemovesRoom(false, false) === false,
  'leaving a shared room keeps the room',
);
