/** Reproduce an overlapping reconnect and verify the surviving session retains its seat. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { DbConnection } from '../client/src/module_bindings/index.ts';
const database = 'room-economy-test',
  host = 'http://127.0.0.1:3000';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, message: string, timeout = 10000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw Error(message);
    await delay(30);
  }
}
async function connect(token?: string) {
  let credential = '';
  const db = await new Promise<DbConnection>((resolve, reject) => {
    let builder = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database);
    if (token) builder = builder.withToken(token);
    builder
      .onConnect((db, _id, saved) => {
        credential = saved;
        db.subscriptionBuilder()
          .onApplied(() => resolve(db))
          .onError(reject)
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
  return { db, token: credential };
}
const old = await connect(),
  guest = await connect();
let returning: Awaited<ReturnType<typeof connect>> | undefined;
try {
  const known = new Set([...old.db.db.lobby.iter()].map((row) => row.id));
  await old.db.reducers.createLobby({ startingCoins: 5000 });
  const room = [...old.db.db.lobby.iter()].find((row) => !known.has(row.id))!;
  const clientId = crypto.randomUUID(),
    guestId = crypto.randomUUID(),
    member = `member_${room.id}_${clientId}`;
  await old.db.reducers.joinLobby({
    lobbyCode: room.code,
    clientId,
    name: 'Reconnect',
  });
  await guest.db.reducers.joinLobby({
    lobbyCode: room.code,
    clientId: guestId,
    name: 'Guest',
  });
  await old.db.reducers.createGameTable({
    lobbyId: room.id,
    gameType: 'poker',
    settings: JSON.stringify({ name: 'Reconnect proof', maxPlayers: 5 }),
  });
  const table = [...old.db.db.gameTable.iter()].find(
    (row) => row.lobbyId === room.id,
  )!;
  await guest.db.reducers.joinTable({
    tableId: table.id,
    lobbyMemberId: `member_${room.id}_${guestId}`,
    buyIn: 400,
  });
  returning = await connect(old.token);
  await returning.db.reducers.joinLobby({
    lobbyCode: room.code,
    clientId,
    name: 'Reconnect',
  });
  old.db.disconnect();
  await delay(700);
  if (process.env.SEAT_PROOF_EXPECT_BUG === '1') {
    await until(
      () => guest.db.db.lobbyMember.id.find(member)?.connected === false,
      'Old disconnect incorrectly marks live replacement away',
    );
    writeFileSync(
      '/tmp/seat-reconnect-before.json',
      JSON.stringify(
        {
          survivingSocketActive: returning.db.isActive,
          memberIncorrectlyDisconnected: true,
          seatedPlayers: [...guest.db.db.gameSeat.iter()].filter(
            (row) => row.tableId === table.id,
          ).length,
        },
        null,
        2,
      ),
    );
    console.log(
      'REPRODUCED: old socket disconnect marks the live replacement offline',
    );
  } else {
    assert.equal(guest.db.db.lobbyMember.id.find(member)?.connected, true);
    // Wait past the actual waiting-seat expiry rather than shortening a production timer.
    await delay(63000);
    const seats = [...guest.db.db.gameSeat.iter()].filter(
      (row) => row.tableId === table.id,
    );
    assert.equal(seats.length, 2);
    assert.ok(seats.some((row) => row.lobbyMemberId === member));
    await returning.db.reducers.handleGameIntent({
      tableId: table.id,
      clientId,
      intentPayload: '{"type":"start_game"}',
    });
    await until(
      () =>
        JSON.parse(guest.db.db.gameTable.id.find(table.id)!.stateJson).phase ===
        'play',
      'Host starts the actual two-seat game',
    );
    writeFileSync(
      '/tmp/seat-reconnect-after.json',
      JSON.stringify(
        {
          survivingSocketActive: true,
          memberConnected: true,
          seatsAfter63Seconds: 2,
          hostStartSucceeded: true,
        },
        null,
        2,
      ),
    );
    console.log('SEAT RECONNECT PROOF PASSED');
  }
} finally {
  old.db.disconnect();
  guest.db.disconnect();
  returning?.db.disconnect();
}
