import { afterAll, describe, expect, it } from 'vitest';
import { DbConnection } from './module_bindings';
import { lobbyTableQueries } from './lobby';

const connections: DbConnection[] = [];
let testLobbyCode: string | undefined;
const enabled = process.env.CARDROOM_SEAT_LIVE === '1';
async function connect(): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(process.env.SPACETIMEDB_HOST ?? 'http://127.0.0.1:3101')
      .withDatabaseName(process.env.SPACETIMEDB_DB ?? 'cardhouse-seat-test')
      .onConnect((connection) => {
        connections.push(connection);
        connection
          .subscriptionBuilder()
          .onApplied(() => resolve(connection))
          .onError((ctx) => reject(ctx.event))
          .subscribe([
            'SELECT * FROM Lobby',
            'SELECT * FROM LobbyMember',
            'SELECT * FROM GameTable',
            'SELECT * FROM GameSeat',
            'SELECT * FROM SeatAbsence',
          ]);
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
}
async function until(predicate: () => boolean, timeout = 5_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error('Timed out waiting for subscribed state');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
afterAll(async () => {
  if (testLobbyCode && connections[0]?.isActive)
    await connections[0].reducers.closeLobby({ lobbyCode: testLobbyCode });
  for (const connection of connections) connection.disconnect();
});
describe.skipIf(!enabled)('live three-player seats', () => {
  it('waits for host, reserves a seat, restores it, and expires an absent turn after 60 seconds', async () => {
    const [host, second, third] = await Promise.all([
      connect(),
      connect(),
      connect(),
    ]);
    const known = new Set([...host.db.lobby.iter()].map((row) => row.id));
    await host.reducers.createLobby({});
    await until(() =>
      [...host.db.lobby.iter()].some((row) => !known.has(row.id)),
    );
    const lobby = [...host.db.lobby.iter()].find((row) => !known.has(row.id))!;
    testLobbyCode = lobby.code;
    await new Promise<void>((resolve, reject) => {
      host
        .subscriptionBuilder()
        .onApplied(() => resolve())
        .onError((ctx) => reject(ctx.event))
        .subscribe(lobbyTableQueries(lobby.id));
    });
    const clients = [host, second, third];
    const ids = clients.map((_connection, i) => `seat-live-${Date.now()}-${i}`);
    for (const [i, connection] of clients.entries()) {
      await connection.reducers.joinLobby({
        lobbyCode: lobby.code,
        clientId: ids[i],
        name: `Player ${i}`,
      });
    }
    await host.reducers.createGameTable({
      lobbyId: lobby.id,
      gameType: 'poker',
      settings: JSON.stringify({ maxPlayers: 3 }),
    });
    await until(() =>
      [...host.db.gameTable.iter()].some((row) => row.lobbyId === lobby.id),
    );
    const table = [...host.db.gameTable.iter()].find(
      (row) => row.lobbyId === lobby.id,
    )!;
    const members = ids.map((id) => `member_${lobby.id}_${id}`);
    for (const [i, connection] of clients.entries()) {
      await connection.reducers.joinTable({
        tableId: table.id,
        lobbyMemberId: members[i],
      });
      expect(
        JSON.parse(host.db.gameTable.id.find(table.id)!.stateJson).phase,
      ).toBe('lobby');
    }
    await until(
      () =>
        [...host.db.gameSeat.iter()].filter((row) => row.tableId === table.id)
          .length === 3,
    );
    await expect(
      second.reducers.handleGameIntent({
        tableId: table.id,
        clientId: ids[1],
        intentPayload: '{"type":"start_game"}',
      }),
    ).rejects.toThrow();
    await host.reducers.handleGameIntent({
      tableId: table.id,
      clientId: ids[0],
      intentPayload: '{"type":"start_game"}',
    });
    await until(
      () =>
        JSON.parse(host.db.gameTable.id.find(table.id)!.stateJson).phase ===
        'play',
    );
    // The last player can return before their turn; the hand and seat stay intact.
    const before = host.db.gameTable.id.find(table.id)!.stateJson;
    await third.reducers.leaveTable({
      tableId: table.id,
      lobbyMemberId: members[2],
    });
    await until(() =>
      [...host.db.seatAbsence.iter()].some(
        (row) => row.lobbyMemberId === members[2],
      ),
    );
    expect(
      [...host.db.gameSeat.iter()].filter((row) => row.tableId === table.id),
    ).toHaveLength(3);
    expect(
      [...host.db.seatAbsence.iter()].find(
        (row) => row.lobbyMemberId === members[2],
      )!.deadlineMicros,
    ).toBeUndefined();
    await third.reducers.joinTable({
      tableId: table.id,
      lobbyMemberId: members[2],
    });
    await until(
      () =>
        ![...host.db.seatAbsence.iter()].some(
          (row) => row.lobbyMemberId === members[2],
        ),
    );
    expect(host.db.gameTable.id.find(table.id)!.stateJson).toBe(before);
    const turn = JSON.parse(before).turnSeatIndex as number;
    const acting = clients[turn];
    await acting.reducers.leaveTable({
      tableId: table.id,
      lobbyMemberId: members[turn],
    });
    await until(() =>
      [...host.db.seatAbsence.iter()].some(
        (row) =>
          row.lobbyMemberId === members[turn] &&
          row.deadlineMicros !== undefined,
      ),
    );
    const absence = [...host.db.seatAbsence.iter()].find(
      (row) => row.lobbyMemberId === members[turn],
    )!;
    expect(
      Number(absence.deadlineMicros! / 1000n) - Date.now(),
    ).toBeGreaterThan(55_000);
    expect(
      [...host.db.gameSeat.iter()].some(
        (row) => row.lobbyMemberId === members[turn],
      ),
    ).toBe(true);
    console.log(
      'Three players joined; host started; reserved seat returned; 60-second turn countdown running',
    );
    await until(
      () =>
        ![...host.db.gameSeat.iter()].some(
          (row) => row.lobbyMemberId === members[turn],
        ),
      65_000,
    );
    expect(
      [...host.db.seatAbsence.iter()].some(
        (row) => row.lobbyMemberId === members[turn],
      ),
    ).toBe(false);
  }, 90_000);
});
