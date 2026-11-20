import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { FLOOR_STEP_MS, RECEPTION } from '../src/shared/casino-floor.ts';
import { strategyFor } from '../src/shared/games/bots/registry.ts';
const host = process.env.SPACETIMEDB_HOST ?? 'http://127.0.0.1:3000';
const database = process.env.SPACETIMEDB_DB ?? 'room-economy-test';
if (
  !database.startsWith('room-economy-') ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(host)
)
  throw Error('Isolated local test database required');
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, message: string, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let last = 0;
  while (!check()) {
    if (Date.now() > deadline) throw Error(message);
    if (Date.now() - last > 10_000) {
      console.log('Waiting: ' + message);
      last = Date.now();
    }
    await delay(100);
  }
}
async function connect(name: string) {
  const connection = await new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((db) => {
        db.subscriptionBuilder()
          .onApplied(() => resolve(db))
          .onError(reject)
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
  return { connection, name, clientId: `lifecycle-${name}-${Date.now()}` };
}
const people = await Promise.all(
  [
    'Host',
    'Successor',
    'AwayOne',
    'AwayTwo',
    'DisconnectedHost',
    'Replacement',
  ].map(connect),
);
const [a, b, c, d, e, f] = people;
const db = a.connection.db;
const proof: Record<string, unknown>[] = [];
const record = (name: string, data: unknown) => {
  proof.push({ name, data });
  console.log(
    JSON.stringify({ name, data }, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  );
  writeFileSync(
    '/tmp/room-economy-lifecycle-proof.json',
    JSON.stringify(
      proof,
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
  );
};
try {
  await a.connection.reducers.createLobby({ startingCoins: 200 });
  const room = [...db.lobby.iter()].find((row) =>
    row.id.startsWith(`lobby_${a.connection.identity!.toHexString()}_`),
  )!;
  for (const actor of people)
    await actor.connection.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: actor.clientId,
      name: actor.name,
    });
  const member = (actor: typeof a) => `member_${room.id}_${actor.clientId}`;
  const wallet = (actor: typeof a) => db.roomWallet.id.find(member(actor))!;
  const join = async (actor: typeof a, tableId: string) => {
    await actor.connection.reducers.joinTable({
      tableId,
      lobbyMemberId: member(actor),
    });
    await until(
      () =>
        [...db.gameSeat.iter()].some(
          (row) =>
            row.tableId === tableId && row.lobbyMemberId === member(actor),
        ),
      'Joined seat visible',
    );
  };
  const leave = async (actor: typeof a, tableId: string) =>
    actor.connection.reducers.leaveTable({
      tableId,
      lobbyMemberId: member(actor),
    });
  const intent = async (actor: typeof a, tableId: string, action: unknown) => {
    const previous = db.gameTable.id.find(tableId)?.stateJson;
    await actor.connection.reducers.handleGameIntent({
      tableId,
      clientId: actor.clientId,
      intentPayload: JSON.stringify(action),
    });
    await until(
      () => db.gameTable.id.find(tableId)?.stateJson !== previous,
      'Move visible',
    );
  };
  async function create(
    actor: typeof a,
    name: string,
    maxPlayers: number,
    entryFee = 20,
  ) {
    await actor.connection.reducers.createGameTable({
      lobbyId: room.id,
      gameType: 'bluff',
      settings: JSON.stringify({ name, maxPlayers, entryFee }),
    });
    await until(
      () =>
        [...db.gameTable.iter()].some(
          (row) => row.lobbyId === room.id && row.name === name,
        ),
      'New table visible',
    );
    return [...db.gameTable.iter()].find(
      (row) => row.lobbyId === room.id && row.name === name,
    )!;
  }
  await assert.rejects(
    a.connection.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: a.clientId + '-changed',
      name: 'Duplicate grant',
    }),
  );
  const hosting = await create(a, 'Hosting grace', 3);
  await join(b, hosting.id);
  await leave(a, hosting.id);
  await delay(1200);
  await join(a, hosting.id);
  assert.equal(db.gameTable.id.find(hosting.id)!.hostMemberId, member(a));
  record('host-return-grace', {
    originalHostPreserved: true,
    creatorAutoSeated: true,
  });
  await leave(a, hosting.id);
  const disconnected = await create(e, 'Disconnected waiting host', 3);
  await join(f, disconnected.id);
  e.connection.disconnect();
  const countdown = await create(c, 'Full table countdown', 2);
  await join(d, countdown.id);
  await until(
    () => db.gameTable.id.find(countdown.id)?.startsAt !== undefined,
    'Countdown starts',
  );
  await leave(d, countdown.id);
  await until(
    () => db.gameTable.id.find(countdown.id)?.startsAt === undefined,
    'Countdown cancels',
  );
  assert.equal(wallet(d).available, 400n);
  await join(d, countdown.id);
  await until(
    () =>
      JSON.parse(db.gameTable.id.find(countdown.id)!.stateJson).phase ===
      'play',
    'Full-table automatic start',
    15_000,
  );
  record('full-countdown', {
    seconds: 10,
    cancelledOnDeparture: true,
    reservationRefunded: true,
    restartedAndDealt: true,
  });
  for (const actor of [c, d])
    await actor.connection.reducers.leaveLobby({
      lobbyId: room.id,
      clientId: actor.clientId,
    });
  await until(
    () =>
      [...db.tableFunding.iter()]
        .filter((row) => row.tableId === countdown.id)
        .every((row) => row.cpu),
    '30-second CPU takeover',
    40_000,
  );
  assert.equal(
    [...db.roomWallet.iter()].filter((row) => row.lobbyId === room.id).length,
    6,
  );
  record('cpu-takeover', {
    graceSeconds: 30,
    originalWalletsRetained: true,
    noCpuWallets: true,
  });
  await until(
    () => db.gameTable.id.find(hosting.id)?.hostMemberId === member(b),
    '60-second absent-host transfer',
    40_000,
  );
  await join(a, hosting.id);
  assert.equal(db.gameTable.id.find(hosting.id)!.hostMemberId, member(b));
  await assert.rejects(intent(a, hosting.id, { type: 'start_game' }));
  record('host-transfer', {
    absenceSeconds: 60,
    connectedSuccessor: true,
    returningCreatorDoesNotStealHost: true,
  });
  await until(
    () => db.gameTable.id.find(disconnected.id)?.hostMemberId === member(f),
    'Disconnected waiting host is replaced',
    20_000,
  );
  assert.equal(wallet(e).available, 400n);
  assert.equal(
    [...db.gameSeat.iter()].some(
      (row) =>
        row.tableId === disconnected.id && row.lobbyMemberId === member(e),
    ),
    false,
  );
  await leave(f, disconnected.id);
  record('waiting-disconnect-refund', {
    graceSeconds: 60,
    refundedCoins: 20,
    replacementSeatAvailable: true,
  });
  await leave(a, hosting.id);
  await leave(b, hosting.id);
  await until(
    () => !!db.gameSettlement.id.find(`${countdown.id}:1`),
    'CPU finishes paid game',
    240_000,
  );
  const settlement = db.gameSettlement.id.find(`${countdown.id}:1`)!;
  assert.equal(
    [...db.tableFunding.iter()].filter((row) => row.tableId === countdown.id)
      .length,
    0,
  );
  assert.equal(wallet(c).profit + wallet(d).profit, 0n);
  for (const actor of [c, d])
    assert.equal(db.lobbyMember.id.find(member(actor)), null);
  record('cpu-original-payout', {
    participants: JSON.parse(settlement.summaryJson),
    departedMembershipsReleased: true,
  });
  for (const actor of [c, d]) {
    const granted = wallet(actor).granted;
    await actor.connection.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: actor.clientId,
      name: actor.name,
    });
    assert.equal(wallet(actor).granted, granted);
  }
  const broke = await create(a, 'Refill tracking', 3, 200);
  await join(b, broke.id);
  await assert.rejects(
    a.connection.reducers.refillRoomCoins({
      lobbyId: room.id,
      clientId: a.clientId,
    }),
    /Cash out or finish/,
  );
  await intent(a, broke.id, { type: 'start_game' });
  const strategy = strategyFor('bluff')!;
  for (let turn = 0; turn < 2000; turn += 1) {
    const state = JSON.parse(db.gameTable.id.find(broke.id)!.stateJson);
    if (state.phase === 'finished') break;
    const index = strategy.actingSeats(state)[0];
    const actor = index === 0 ? a : b;
    await intent(actor, broke.id, strategy.choose(state, index));
  }
  const loser = wallet(a).available === 0n ? a : b;
  assert.equal(wallet(loser).available, 0n);
  const profit = wallet(loser).profit;
  await leave(loser, broke.id);
  await loser.connection.reducers.enterCasinoFloor({ lobbyId: room.id });
  await assert.rejects(
    loser.connection.reducers.refillRoomCoins({
      lobbyId: room.id,
      clientId: loser.clientId,
    }),
    /Visit reception/,
  );
  assert.equal(wallet(loser).available, 0n);
  await loser.connection.reducers.moveCasinoAvatar({
    lobbyId: room.id,
    ...RECEPTION,
    chair: -1,
  });
  const walk = loser.connection.db.casinoPresence.id.find(member(loser))!;
  await delay(JSON.parse(walk.pathJson).length * FLOOR_STEP_MS);
  await loser.connection.reducers.refillRoomCoins({
    lobbyId: room.id,
    clientId: loser.clientId,
  });
  await until(() => wallet(loser).available === 400n, 'Refill visible');
  assert.equal(wallet(loser).profit, profit);
  assert.equal(wallet(loser).granted, 800n);
  await assert.rejects(
    loser.connection.reducers.refillRoomCoins({
      lobbyId: room.id,
      clientId: loser.clientId,
    }),
    /cannot afford a table/,
  );
  record('refill-and-rank', {
    availableCoins: 200,
    totalGrants: 400,
    profitUnits: profit,
    blockedWhileCommitted: true,
    blockedOutsideReception: true,
    repeatedRefillRejected: true,
  });
  console.log('LIFECYCLE CHECKS PASSED');
} finally {
  for (const actor of people)
    if (actor.connection.isActive) actor.connection.disconnect();
}
