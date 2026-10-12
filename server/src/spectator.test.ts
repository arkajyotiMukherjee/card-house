import { spectateBlock, spectatorRowId } from './spectator.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  spectateBlock({
    seated: false,
    watchingThis: false,
    watchingOther: false,
  }) === undefined,
  'an open seat is not required to watch',
);
assert(
  spectateBlock({
    seated: true,
    watchingThis: false,
    watchingOther: false,
  }) === 'Already seated',
  'a seated player does not also take a spectator row',
);
assert(
  spectateBlock({
    seated: false,
    watchingThis: true,
    watchingOther: false,
  }) === 'Already watching',
  'watching this table twice does not insert a second row',
);
assert(
  spectateBlock({
    seated: false,
    watchingThis: false,
    watchingOther: true,
  }) === 'Already watching',
  'a member watches one table at a time',
);
assert(
  spectatorRowId('table_1', 'member_1') === 'spectator_table_1_member_1',
  'spectator ids stay separate from seat ids',
);

console.log(JSON.stringify({ ok: true }));
