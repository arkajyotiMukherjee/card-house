import { idsForMember, markDisconnected } from './lobby-presence.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const member = { id: 'member_1', connected: true };
const disconnected = markDisconnected(member);
assert(disconnected.id === 'member_1', 'a disconnect keeps the member');
assert(disconnected.connected === false, 'a disconnect marks the member away');
assert(
  member.connected === true,
  'a disconnect does not edit the original row',
);

const seats = [
  { id: 'seat_a', lobbyMemberId: 'member_1' },
  { id: 'seat_b', lobbyMemberId: 'member_2' },
];
const spectators = [
  { id: 'watch_a', lobbyMemberId: 'member_1' },
  { id: 'watch_b', lobbyMemberId: 'member_2' },
];
assert(
  idsForMember('member_1', seats).join(',') === 'seat_a',
  'leave drops only this member’s seats',
);
assert(
  idsForMember('member_1', spectators).join(',') === 'watch_a',
  'leave drops only this member’s spectator rows',
);
assert(
  idsForMember('member_9', seats).length === 0,
  'someone who is not seated drops no seats',
);
