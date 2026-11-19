/** Exercises room limits and movement against an isolated local module. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import {
  RECEPTION,
  floorRows,
  floorTable,
  floorDirectionPath,
  tableEntrance,
  walkable,
  floorPath,
  nextFloorSlot,
  SPAWN,
} from '../src/shared/casino-floor.ts';

const host = process.env.SPACETIMEDB_HOST ?? 'http://127.0.0.1:3000';
const database = process.env.SPACETIMEDB_DB ?? 'room-economy-test';
assert.match(host, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(database, /^room-economy-/);
const cli = process.env.CASINO_SPACETIME_CLI ?? 'spacetime';
const rootDir = process.env.CASINO_SPACETIME_ROOT;
const clients: DbConnection[] = [];
const started = Date.now();

async function connect(subscriptions: string[], token?: string) {
  const db = await new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((db) => {
        db.subscriptionBuilder()
          .onApplied(() => resolve(db))
          .onError(reject)
          .subscribe(subscriptions);
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
  clients.push(db);
  return { db, clientId: crypto.randomUUID() };
}

type Actor = Awaited<ReturnType<typeof connect>>;

async function until(test: () => boolean, message: string) {
  const expires = Date.now() + 8000;
  while (!test()) {
    if (Date.now() > expires) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function group(count: number, task: (index: number) => Promise<Actor>) {
  const people: Actor[] = [];
  for (let base = 0; base < count; base += 10) {
    people.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(10, count - base) }, (_, i) =>
          task(base + i),
        ),
      )),
    );
  }
  return people;
}

function operator(actor: Actor, role: 'admin' | 'discord') {
  const identity = actor.db.identity?.toHexString();
  assert.match(identity ?? '', /^[a-f0-9]{64}$/);
  execFileSync(
    cli,
    [
      ...(rootDir ? ['--root-dir', rootDir] : []),
      'sql',
      '--server',
      host,
      database,
      `INSERT INTO "CasinoOperator" (identity, role) VALUES ('${identity}', '${role}')`,
      '-y',
    ],
    { timeout: 10000, stdio: 'pipe' },
  );
}

assert.equal(nextFloorSlot([4, 0, 2, 1]), 3);
assert.equal(floorPath(SPAWN, { x: 6, y: 4 }, floorRows(1)).length, 0);
const rows = floorRows(6);
for (const slot of [1, 3]) {
  const center = floorTable(slot);
  const north = { x: center.x, y: center.y - 2 };
  const south = tableEntrance(slot);
  const expected = Array.from({ length: 4 }, (_, step) => ({
    x: center.x,
    y: north.y + step + 1,
  }));
  const otherTables = new Set([0, 2, 4]);
  assert.deepEqual(floorPath(north, south, rows, otherTables), expected);
  assert.deepEqual(
    floorDirectionPath(north, { x: 0, y: 1 }, rows, otherTables),
    expected,
  );
  const withTable = new Set([...otherTables, slot]);
  assert.ok(floorPath(north, south, rows, withTable).length > expected.length);
  assert.deepEqual(
    floorDirectionPath(north, { x: 0, y: 1 }, rows, withTable),
    [],
  );
  assert.deepEqual(
    floorPath(center, south, rows, withTable),
    expected.slice(2),
  );
}
const occupied = new Set(Array.from({ length: 25 }, (_, i) => i));
for (let i = 0; i < 25; i += 1) {
  const target = tableEntrance(i),
    rows = floorRows(25);
  const path = floorPath(SPAWN, target, rows, occupied);
  assert.deepEqual(path.at(-1), target);
  assert.ok(path.every((point) => walkable(point, rows, occupied)));
}

try {
  const hostPlayer = await connect([
    'SELECT * FROM Lobby',
    'SELECT * FROM CasinoTableSpot',
    'SELECT * FROM CasinoPresence',
    'SELECT * FROM LobbyMember',
    'SELECT * FROM my_casino_room_chat',
    'SELECT * FROM my_casino_table_chat',
    'SELECT * FROM my_casino_profile',
    'SELECT * FROM my_casino_tables',
  ]);
  const moderator = await connect(['SELECT * FROM my_casino_voice_targets']);
  const bridge = await connect(['SELECT * FROM my_casino_voice_targets']);
  operator(moderator, 'admin');
  operator(bridge, 'discord');
  await hostPlayer.db.reducers.createLobby({ startingCoins: 5000 });
  const ownedRoom = () =>
    [...hostPlayer.db.db.lobby.iter()].find(
      (row) => row.creatorIdentity === hostPlayer.db.identity?.toHexString(),
    );
  await until(() => !!ownedRoom(), 'Host room');
  const room = ownedRoom()!;
  const join = (actor: Actor, index: number) =>
    actor.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: actor.clientId,
      name: `Guest ${index}`,
    });
  await join(hostPlayer, 0);
  await hostPlayer.db.reducers.enterCasinoFloor({ lobbyId: room.id });
  const vacant = floorTable(1);
  await hostPlayer.db.reducers.moveCasinoAvatar({
    lobbyId: room.id,
    ...vacant,
    chair: -1,
  });
  const hostPath = () =>
    JSON.parse(
      [...hostPlayer.db.db.casinoPresence.iter()].find((row) =>
        row.id.endsWith(hostPlayer.clientId),
      )?.pathJson ?? '[]',
    );
  await until(
    () => hostPath().at(-1)?.y === vacant.y,
    'Server accepts walks through a vacant table slot',
  );
  assert.ok(hostPath().every((point: { x: number }) => point.x === vacant.x));
  const peers = await group(15, async (index) => {
    const actor = await connect(['SELECT * FROM my_casino_room_chat']);
    await join(actor, index + 1);
    return actor;
  });
  const outsider = await connect([
    'SELECT * FROM my_casino_room_chat',
    'SELECT * FROM my_casino_table_chat',
  ]);
  await assert.rejects(join(outsider, 16), /Room is full/);
  await assert.rejects(
    hostPlayer.db.reducers.setCasinoRoomTier({ lobbyId: room.id, tier: 'pro' }),
    /Casino operator required/,
  );
  const makeTable = (actor: Actor, i: number) =>
    actor.db.reducers.createGameTable({
      lobbyId: room.id,
      gameType: 'bluff',
      settings: JSON.stringify({ name: `Table ${i}`, maxPlayers: 6 }),
    });
  await Promise.all(
    peers.slice(0, 3).map((actor, index) => makeTable(actor, index)),
  );
  await assert.rejects(makeTable(peers[3], 4), /table/i);
  await until(
    () =>
      [...hostPlayer.db.db.casinoTableSpot.iter()].filter(
        (row) => row.lobbyId === room.id,
      ).length === 3,
    'Three free tables',
  );
  console.log(
    'Free room reached 16 people and 3 tables. Both excess requests were rejected.',
  );

  const owner = hostPlayer.db;
  const floorMove = async (point: { x: number; y: number }, chair = -1) =>
    owner.reducers.moveCasinoAvatar({ lobbyId: room.id, ...point, chair });
  await new Promise((resolve) => setTimeout(resolve, 160));
  await assert.rejects(floorMove({ x: 6, y: 4 }), /cannot be reached/);
  await assert.rejects(floorMove(floorTable(2)), /cannot be reached/);
  await floorMove(RECEPTION);
  const presence = () =>
    [...owner.db.casinoPresence.iter()].find((row) =>
      row.id.endsWith(hostPlayer.clientId),
    );
  await until(() => presence()?.pathJson !== '[]', 'Movement visible');
  assert.deepEqual(JSON.parse(presence()!.pathJson).at(-1), RECEPTION);

  const discordUserId = '111222333444555666';
  const linkId = '1'.repeat(64);
  await owner.reducers.beginCasinoDiscordLink({ id: linkId });
  await assert.rejects(
    outsider.db.reducers.completeCasinoDiscordLink({
      id: linkId,
      discordUserId,
    }),
    /Casino operator required/,
  );
  await bridge.db.reducers.completeCasinoDiscordLink({
    id: linkId,
    discordUserId,
  });
  await until(
    () =>
      [...owner.db.myCasinoProfile.iter()].some(
        (row) => row.discordUserId === discordUserId,
      ),
    'Verified account',
  );
  const snowflake = (offset: number) =>
    (
      (BigInt(Date.now()) - 1420070400000n) * 4194304n +
      BigInt(offset)
    ).toString();
  const scopedChannel = snowflake(1);
  await bridge.db.reducers.setLobbyDiscordChannel({
    lobbyCode: room.code,
    discordChannelId: '666666666666666666',
  });
  await bridge.db.reducers.setLobbyDiscordVoice({
    lobbyCode: room.code,
    discordGuildId: '333333333333333333',
    discordLobbyVoiceChannelId: scopedChannel,
  });
  const message = {
    channelId: scopedChannel,
    messageId: '444444444444444444',
    discordUserId,
    author: 'Ava',
    body: 'Anyone for Bluff?',
    deleted: false,
  };
  await bridge.db.reducers.mirrorCasinoDiscordMessage(message);
  await bridge.db.reducers.mirrorCasinoDiscordMessage(message);
  await until(
    () => [...owner.db.myCasinoRoomChat.iter()].length === 1,
    'One imported room message',
  );
  assert.equal([...outsider.db.db.myCasinoRoomChat.iter()].length, 0);
  await bridge.db.reducers.mirrorCasinoDiscordMessage({
    ...message,
    deleted: true,
  });
  await bridge.db.reducers.mirrorCasinoDiscordMessage(message);
  await until(
    () => [...owner.db.myCasinoRoomChat.iter()].length === 0,
    'Delete remains deleted',
  );
  const verifiedAppearance = JSON.stringify({
    body: 1,
    skin: 2,
    hair: 4,
    hairColor: 2,
    outfit: 1,
    color: 4,
    pantsColor: 2,
  });
  await owner.reducers.saveCasinoAvatar({
    lobbyId: room.id,
    avatar: verifiedAppearance,
  });
  const otherDevice = await connect(['SELECT * FROM my_casino_profile']);
  const newChallenge = '2'.repeat(64);
  await otherDevice.db.reducers.beginCasinoDiscordLink({ id: newChallenge });
  await bridge.db.reducers.completeCasinoDiscordLink({
    id: newChallenge,
    discordUserId,
  });
  await until(
    () =>
      [...otherDevice.db.db.myCasinoProfile.iter()].some(
        (row) => row.avatar === verifiedAppearance,
      ),
    'Avatar restored on second device',
  );
  const table = [...owner.db.myCasinoTables.iter()][0]!;
  const tableChannel = snowflake(2);
  await bridge.db.reducers.setTableDiscordVoice({
    tableId: table.id,
    discordVoiceChannelId: tableChannel,
  });
  await assert.rejects(
    owner.reducers.updateVoicePresence({
      discordUserId,
      discordVoiceChannelId: scopedChannel,
    }),
    /Casino operator required/,
  );
  await bridge.db.reducers.updateVoicePresence({
    discordUserId,
    discordVoiceChannelId: scopedChannel,
  });
  await owner.reducers.joinTable({
    tableId: table.id,
    lobbyMemberId: presence()!.id,
  });
  await until(
    () =>
      [...bridge.db.db.myCasinoVoiceTargets.iter()].some(
        (row) =>
          row.sourceChannelId === scopedChannel &&
          row.targetChannelId === tableChannel,
      ),
    'Room-to-table voice target',
  );
  const tableMessage = {
    ...message,
    channelId: tableChannel,
    body: 'Table-only message',
  };
  await bridge.db.reducers.mirrorCasinoDiscordMessage(tableMessage);
  await until(
    () =>
      [...owner.db.myCasinoTableChat.iter()].some(
        (row) => row.body === tableMessage.body,
      ),
    'In-table Discord chat',
  );
  assert.equal([...outsider.db.db.myCasinoTableChat.iter()].length, 0);
  assert.equal([...owner.db.myCasinoRoomChat.iter()].length, 0);
  await bridge.db.reducers.updateVoicePresence({
    discordUserId,
    discordVoiceChannelId: tableChannel,
  });
  await owner.reducers.leaveTable({
    tableId: table.id,
    lobbyMemberId: presence()!.id,
  });
  await until(
    () =>
      [...bridge.db.db.myCasinoVoiceTargets.iter()].some(
        (row) =>
          row.sourceChannelId === tableChannel &&
          row.targetChannelId === scopedChannel,
      ),
    'Table-to-room voice target',
  );
  await until(
    () => [...owner.db.myCasinoTableChat.iter()].length === 0,
    'Table chat revoked on leave',
  );
  console.log(
    'Movement, cross-device avatar, Discord room and table chat isolation, and both voice targets passed.',
  );

  await moderator.db.reducers.setCasinoRoomTier({
    lobbyId: room.id,
    tier: 'pro',
  });
  const more = await group(84, async (index) => {
    const actor = await connect(['SELECT * FROM my_casino_room_chat']);
    await join(actor, index + 16);
    await actor.db.reducers.enterCasinoFloor({ lobbyId: room.id });
    return actor;
  });
  for (let i = 0; i < 22; i += 1) await makeTable(more[i], i + 3);
  await assert.rejects(makeTable(more[22], 25), /table/i);
  await assert.rejects(join(outsider, 100), /Room is full/);
  await until(
    () =>
      [...owner.db.casinoTableSpot.iter()].filter(
        (row) => row.lobbyId === room.id,
      ).length === 25,
    '25 simultaneous table markers',
  );
  await until(
    () =>
      [...owner.db.lobbyMember.iter()].filter(
        (row) => row.lobbyId === room.id && row.connected,
      ).length === 100,
    '100 simultaneous players',
  );
  const slots = [...owner.db.casinoTableSpot.iter()]
    .filter((row) => row.lobbyId === room.id)
    .map((row) => row.slot)
    .sort((a, b) => a - b);
  assert.deepEqual(
    slots,
    Array.from({ length: 25 }, (_, i) => i),
  );
  console.log(
    `Pro room reached 100 people and 25 tables across five wings. Excess requests rejected. ${Date.now() - started} ms.`,
  );
} finally {
  clients.forEach((client) => client.disconnect());
}
