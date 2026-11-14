/** Run only against an isolated local test module; never a hosted database. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { strategyFor } from '../src/shared/games/bots/registry.ts';
import { pokerRaiseRange, type PokerState } from '../src/shared/games/poker.ts';
const host = process.env.SPACETIMEDB_HOST ?? 'http://127.0.0.1:3000';
const database = process.env.SPACETIMEDB_DB ?? 'room-economy-test';
if (
  !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(host) ||
  !database.startsWith('room-economy-')
)
  throw Error('Use a local room-economy-* test database');
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, message: string, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw Error(message);
    await delay(20);
  }
}
async function connect(name: string) {
  let token = '';
  const connection = await new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((db, _identity, credential) => {
        token = credential;
        db.subscriptionBuilder()
          .onApplied(() => resolve(db))
          .onError(reject)
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
  return { connection, token, name, clientId: crypto.randomUUID() };
}
const people = await Promise.all(
  ['Alice', 'Bob', 'Casey', 'Dana'].map(connect),
);
const [alice, bob] = people;
const db = alice.connection.db;
const proofs: Record<string, unknown>[] = [];
function record(name: string, data: unknown) {
  proofs.push({ name, data });
  console.log(
    JSON.stringify({ name, data }, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  );
}
try {
  await alice.connection.reducers.createLobby({ startingCoins: 5000 });
  const room = [...db.lobby.iter()].find((row) =>
    row.id.startsWith(`lobby_${alice.connection.identity!.toHexString()}_`),
  )!;
  assert.ok(room);
  for (const actor of people)
    await actor.connection.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: actor.clientId,
      name: actor.name,
    });
  const memberId = (actor: typeof alice) =>
    `member_${room.id}_${actor.clientId}`;
  const wallet = (actor: typeof alice) =>
    db.roomWallet.id.find(memberId(actor))!;
  await until(() => people.every((actor) => !!wallet(actor)), 'Four wallets');
  await alice.connection.reducers.leaveLobby({
    lobbyId: room.id,
    clientId: alice.clientId,
  });
  await alice.connection.reducers.joinLobby({
    lobbyCode: room.code,
    clientId: alice.clientId,
    name: alice.name,
  });
  assert.equal(wallet(alice).available, 10_000n);
  await assert.rejects(
    bob.connection.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: alice.clientId,
      name: 'Impersonator',
    }),
  );
  record('grants-rejoin-ownership', {
    room: room.code,
    grant: 5000,
    repeatGrant: false,
    spoofRejected: true,
  });
  async function create(
    gameType: string,
    settings: Record<string, unknown> = {},
  ) {
    const known = new Set([...db.gameTable.iter()].map((row) => row.id));
    await alice.connection.reducers.createGameTable({
      lobbyId: room.id,
      gameType,
      settings: JSON.stringify({
        maxPlayers: ['hearts', 'spades'].includes(gameType) ? 4 : 3,
        ...settings,
      }),
    });
    await until(
      () => [...db.gameTable.iter()].some((row) => !known.has(row.id)),
      'Read new table',
    );
    const table = [...db.gameTable.iter()].find((row) => !known.has(row.id))!;
    assert.equal(table.hostMemberId, memberId(alice));
    assert.ok(
      [...db.gameSeat.iter()].some(
        (row) =>
          row.tableId === table.id && row.lobbyMemberId === memberId(alice),
      ),
    );
    return table;
  }
  const join = (actor: typeof alice, tableId: string, buyIn?: number) =>
    actor.connection.reducers.joinTable({
      tableId,
      lobbyMemberId: memberId(actor),
      buyIn,
    });
  const intent = async (
    actor: typeof alice,
    tableId: string,
    action: unknown,
  ) => {
    const previous = db.gameTable.id.find(tableId)?.stateJson;
    await actor.connection.reducers.handleGameIntent({
      tableId,
      clientId: actor.clientId,
      intentPayload: JSON.stringify(action),
    });
    await until(
      () => db.gameTable.id.find(tableId)?.stateJson !== previous,
      'Wait for all clients to see the move',
    );
  };
  async function play(tableId: string) {
    for (let turn = 0; turn < 6000; turn += 1) {
      const table = db.gameTable.id.find(tableId)!;
      const state = JSON.parse(table.stateJson);
      if (state.phase === 'finished') return turn;
      const strategy = strategyFor(table.gameType)!;
      const index = strategy.actingSeats(state)[0];
      if (index === undefined) {
        await delay(100);
        continue;
      }
      const seat = [...db.gameSeat.iter()].find(
        (row) => row.tableId === tableId && row.seatIndex === index,
      )!;
      const actor = people.find(
        (person) => memberId(person) === seat.lobbyMemberId,
      )!;
      await intent(actor, tableId, strategy.choose(state, index));
    }
    throw Error('Game did not settle');
  }
  const waiting = await create('bluff', { entryFee: 100 });
  assert.equal(wallet(alice).available, 9800n);
  await alice.connection.reducers.leaveTable({
    tableId: waiting.id,
    lobbyMemberId: memberId(alice),
  });
  assert.equal(wallet(alice).available, 10_000n);
  const count = [...db.gameTable.iter()].length;
  await assert.rejects(
    bob.connection.reducers.createGameTable({
      lobbyId: room.id,
      gameType: 'bluff',
      settings: JSON.stringify({ entryFee: 100_000 }),
    }),
  );
  assert.equal([...db.gameTable.iter()].length, count);
  record('reservations-and-atomic-create', {
    refund: true,
    insufficientCreationRolledBack: true,
  });
  for (const game of [
    'bluff',
    'president',
    'go_fish',
    'crazy_eights',
    'rummy',
    'hearts',
    'spades',
  ]) {
    const table = await create(game, { entryFee: 100 });
    const count = Math.max(2, table.minPlayers);
    for (const actor of people.slice(1, count)) await join(actor, table.id);
    await assert.rejects(intent(bob, table.id, { type: 'start_game' }));
    await intent(alice, table.id, { type: 'start_game' });
    console.log('Playing ' + game);
    const turns = await play(table.id);
    await until(
      () => !!db.gameSettlement.id.find(`${table.id}:1`),
      'Game settlement',
    );
    assert.equal(
      [...db.tableFunding.iter()].filter((row) => row.tableId === table.id)
        .length,
      0,
    );
    assert.equal(
      [...db.gameSeat.iter()].filter((row) => row.tableId === table.id).length,
      0,
    );
    assert.equal(
      people.map(wallet).reduce((sum, row) => sum + row.available, 0n),
      40_000n,
    );
    assert.equal(
      people.map(wallet).reduce((sum, row) => sum + row.profit, 0n),
      0n,
    );
    record(`pool-${game}`, {
      turns,
      settlement: JSON.parse(
        db.gameSettlement.id.find(`${table.id}:1`)!.summaryJson,
      ),
    });
  }
  const poker = await create('poker', {
    variation: 'holdem',
    smallBlind: 50,
    bigBlind: 100,
    minBuyIn: 2000,
    maxBuyIn: 5000,
    buyIn: 3000,
  });
  await assert.rejects(join(bob, poker.id, 1500));
  await join(bob, poker.id, 2000);
  await intent(alice, poker.id, { type: 'start_game' });
  let state = JSON.parse(
    db.gameTable.id.find(poker.id)!.stateJson,
  ) as PokerState;
  assert.equal(state.bigBlind, 100);
  const index = state.turnSeatIndex!;
  const range = pokerRaiseRange(state, index)!;
  await intent(index === 0 ? alice : bob, poker.id, {
    type: 'raise',
    amount: range.max,
  });
  state = JSON.parse(db.gameTable.id.find(poker.id)!.stateJson);
  assert.equal(pokerRaiseRange(state, state.turnSeatIndex!), null);
  await intent(state.turnSeatIndex === 0 ? alice : bob, poker.id, {
    type: 'call',
  });
  await until(
    () =>
      JSON.parse(db.gameTable.id.find(poker.id)!.stateJson).phase ===
      'finished',
    'Automatic runout',
  );
  record('poker-funded-all-in', {
    blinds: '50/100',
    buyIns: [3000, 2000],
    settlement: JSON.parse(
      db.gameSettlement.id.find(`${poker.id}:1`)!.summaryJson,
    ),
  });
  for (const actor of [alice, bob])
    if (
      [...db.gameSeat.iter()].some(
        (row) =>
          row.tableId === poker.id && row.lobbyMemberId === memberId(actor),
      )
    )
      await actor.connection.reducers.leaveTable({
        tableId: poker.id,
        lobbyMemberId: memberId(actor),
      });
  await until(
    () =>
      people.map(wallet).reduce((sum, row) => sum + row.available, 0n) ===
      40_000n,
    'Observe cash-outs on every client',
  );
  assert.equal(
    people.map(wallet).reduce((sum, row) => sum + row.available, 0n),
    40_000n,
  );
  record('poker-cashout', { conservation: true, seatsReleased: true });
  const blackjack = await create('blackjack', {
    maxPlayers: 2,
    minBet: 25,
    maxBet: 100,
    minBuyIn: 200,
    maxBuyIn: 2000,
    buyIn: 400,
  });
  await join(bob, blackjack.id, 400);
  await intent(alice, blackjack.id, { type: 'start_game' });
  await play(blackjack.id);
  record(
    'blackjack-house',
    JSON.parse(db.gameSettlement.id.find(`${blackjack.id}:1`)!.summaryJson),
  );
  await alice.connection.reducers.topUpTable({
    tableId: blackjack.id,
    amount: 100,
  });
  for (const actor of [alice, bob])
    await actor.connection.reducers.leaveTable({
      tableId: blackjack.id,
      lobbyMemberId: memberId(actor),
    });
  record('blackjack-topup-and-cashout', { topup: 100, settled: true });
  const laterPoker = await create('poker', {
    maxPlayers: 3,
    minBuyIn: 400,
    maxBuyIn: 2000,
    buyIn: 600,
  });
  await join(bob, laterPoker.id, 600);
  await intent(alice, laterPoker.id, { type: 'start_game' });
  let laterState = JSON.parse(db.gameTable.id.find(laterPoker.id)!.stateJson);
  await intent(laterState.turnSeatIndex === 0 ? alice : bob, laterPoker.id, {
    type: 'fold',
  });
  await join(people[2], laterPoker.id, 800);
  await until(
    () =>
      JSON.parse(db.gameTable.id.find(laterPoker.id)!.stateJson).handNumber ===
      2,
    'Poker between-hand entry',
    15_000,
  );
  laterState = JSON.parse(db.gameTable.id.find(laterPoker.id)!.stateJson);
  assert.equal(
    laterState.seats['2'].chips + laterState.seats['2'].committed,
    800,
  );
  while (laterState.phase !== 'finished') {
    await intent(people[laterState.turnSeatIndex], laterPoker.id, {
      type: 'fold',
    });
    laterState = JSON.parse(db.gameTable.id.find(laterPoker.id)!.stateJson);
  }
  for (const actor of people.slice(0, 3))
    await actor.connection.reducers.leaveTable({
      tableId: laterPoker.id,
      lobbyMemberId: memberId(actor),
    });
  record('poker-between-hand-entry', {
    nextHand: 2,
    newBuyIn: 800,
    mintedStartingChips: false,
  });
  const laterBlackjack = await create('blackjack', {
    maxPlayers: 3,
    minBuyIn: 200,
    maxBuyIn: 2000,
    buyIn: 400,
  });
  await intent(alice, laterBlackjack.id, { type: 'start_game' });
  await play(laterBlackjack.id);
  const previousShoe = JSON.parse(
    db.gameTable.id.find(laterBlackjack.id)!.stateJson,
  ).deck;
  await join(bob, laterBlackjack.id, 600);
  await until(
    () => db.gameTable.id.find(laterBlackjack.id)?.handNumber === 2,
    'Blackjack between-hand entry',
    15_000,
  );
  const nextBlackjack = JSON.parse(
    db.gameTable.id.find(laterBlackjack.id)!.stateJson,
  );
  assert.equal(nextBlackjack.seats['1'].chips, 600);
  assert.deepEqual(nextBlackjack.deck, previousShoe);
  const beforeExitProfit = people.map((actor) => wallet(actor).profit);
  for (const actor of [alice, bob])
    await actor.connection.reducers.leaveTable({
      tableId: laterBlackjack.id,
      lobbyMemberId: memberId(actor),
    });
  await until(
    () =>
      [...db.tableFunding.iter()].every(
        (row) => row.tableId !== laterBlackjack.id,
      ),
    'Cash out unbet seats',
  );
  assert.deepEqual(
    people.map((actor) => wallet(actor).profit),
    beforeExitProfit,
  );
  record('blackjack-between-hand-entry-and-unbet-exit', {
    newBuyIn: 600,
    shoePreserved: true,
    immediateRefundWithoutCpuBet: true,
  });
  writeFileSync(
    '/tmp/room-economy-fixtures.json',
    JSON.stringify({
      room: room.code,
      lobbyId: room.id,
      actors: people.map(({ name, clientId, token }) => ({
        name,
        clientId,
        token,
      })),
    }),
    { mode: 0o600 },
  );
  writeFileSync(
    '/tmp/room-economy-proof.json',
    JSON.stringify(proofs, null, 2),
  );
  console.log('LIVE ECONOMY CHECKS PASSED');
} finally {
  for (const actor of people) actor.connection.disconnect();
}
