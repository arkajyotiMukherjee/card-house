/* global process, window, localStorage, URL, console */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
// First run room-economy.live.ts against an isolated local test database.
const fixture = JSON.parse(
  readFileSync(
    process.env.ROOM_ECONOMY_FIXTURES ?? '/tmp/room-economy-fixtures.json',
    'utf8',
  ),
);
const base = process.env.ROOM_ECONOMY_URL ?? 'http://127.0.0.1:5175';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))
  throw new Error('Browser proofs require an isolated local app');
const out = new URL('../docs/room-economy-evidence', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
  headless: true,
  args: ['--no-sandbox'],
});
const failures = [];
async function persona(actor, mobile = false, engine = browser) {
  const context = await engine.newContext({
    viewport: mobile
      ? { width: 844, height: 390 }
      : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ actor, room }) => {
      if (localStorage.getItem('clientId')) return;
      localStorage.setItem('clientId', actor.clientId);
      localStorage.setItem('stdbToken', actor.token);
      localStorage.setItem(
        'lastRoom',
        JSON.stringify({ lobbyCode: room, name: actor.name, tableId: '' }),
      );
    },
    { actor, room: fixture.room },
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  await page.goto(base + '/');
  await page.waitForTimeout(1800);
  await api(page);
  return { page, context, actor };
}
async function api(page) {
  await page.evaluate(async () => {
    const { DbConnection } = await import('/src/module_bindings/index.ts');
    window.proofDb = await new Promise((resolve, reject) =>
      DbConnection.builder()
        .withUri('http://127.0.0.1:3000')
        .withDatabaseName('room-economy-test')
        .withToken(localStorage.getItem('stdbToken'))
        .onConnect((db) =>
          db
            .subscriptionBuilder()
            .onApplied(() => resolve(db))
            .onError(reject)
            .subscribeToAllTables(),
        )
        .onConnectError((_ctx, error) => reject(error))
        .build(),
    );
  });
}
async function tap(page, x, y, edge) {
  const box = await page.locator('canvas').boundingBox();
  const width = Math.round((box.width / box.height) * 540),
    gutter = (width - 960) / 2;
  const actualX =
    x + (edge === 'right' ? gutter : edge === 'left' ? -gutter : 0);
  await page.mouse.click(
    box.x + ((actualX + gutter) / width) * box.width,
    box.y + (y / 540) * box.height,
  );
  await page.waitForTimeout(250);
}
const capture = async (page, name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('Captured ' + name);
};
// Exercise room creation and automatic host seating through real canvas controls.
const creation = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const createPage = await creation.newPage();
createPage.on('pageerror', (error) => failures.push(error.message));
await createPage.goto(base + '/');
await createPage.waitForTimeout(1600);
await tap(createPage, 480, 190);
await createPage
  .getByRole('textbox', { name: 'Your Name', exact: true })
  .fill('Ada');
await tap(createPage, 350, 348);
await capture(createPage, '01-starting-grant-desktop');
const editNumber = async (label, value) => {
  await createPage.getByRole('textbox', { name: label, exact: true }).focus();
  await createPage.keyboard.press('Control+a');
  await createPage.keyboard.press('Backspace');
  await createPage.keyboard.type(String(value));
};
await editNumber('Starting chips', 10000);
await tap(createPage, 334, 344);
await createPage.waitForTimeout(1500);
await capture(createPage, '02-leaderboard-desktop');
await tap(createPage, 550, 106);
await tap(createPage, 280, 380);
await capture(createPage, '03-entry-fee-desktop');
await editNumber('Entry fee', 100);
await tap(createPage, 334, 344);
await createPage.waitForTimeout(1500);
await capture(createPage, '04-creator-host-desktop');
await api(createPage);
await createPage.evaluate(() => {
  const db = window.proofDb.db;
  const mine = [...db.lobbyMember.iter()].find(
    (row) => row.clientId === localStorage.getItem('clientId'),
  );
  const seat = [...db.gameSeat.iter()].find(
    (row) => row.lobbyMemberId === mine?.id,
  );
  const table = seat && db.gameTable.id.find(seat.tableId);
  if (!table || table.hostMemberId !== mine.id)
    throw Error('Creator was not automatically seated as host');
  if (db.roomWallet.id.find(mine.id)?.available !== 19800n)
    throw Error('Incorrect starting grant or entry reservation');
});
await creation.close();
const [alice, bob] = await Promise.all([
  persona(fixture.actors[0]),
  persona(fixture.actors[1], true),
]);
await capture(alice.page, '05-room-rankings-desktop');
await capture(bob.page, '06-room-rankings-mobile');
await tap(alice.page, 720, 30, 'right');
await alice.page
  .getByRole('textbox', { name: 'Chat', exact: true })
  .fill('Ready for the next table');
await tap(alice.page, 910, 462, 'right');
await capture(alice.page, '07-compact-chat-desktop');
await capture(bob.page, '08-unread-chat-mobile');
await tap(alice.page, 720, 30, 'right');
// Exercise both real configuration forms without reserving coins.
await tap(alice.page, 550, 106, 'right');
await tap(alice.page, 240, 230);
await tap(alice.page, 280, 380);
await capture(alice.page, '09-poker-stakes-desktop');
await tap(alice.page, 624, 452);
await tap(alice.page, 460, 380);
await tap(bob.page, 550, 106, 'right');
await tap(bob.page, 224, 140);
await tap(bob.page, 324, 483);
await capture(bob.page, '10-poker-stakes-mobile');
await tap(bob.page, 646, 486);
await tap(bob.page, 636, 483);
const pokerId = await alice.page.evaluate(async (lobbyId) => {
  const db = window.proofDb;
  const before = new Set([...db.db.gameTable.iter()].map((row) => row.id));
  await db.reducers.createGameTable({
    lobbyId,
    gameType: 'poker',
    settings: JSON.stringify({
      name: 'Room coins poker',
      maxPlayers: 2,
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 400,
      maxBuyIn: 2000,
      buyIn: 1000,
    }),
  });
  return [...db.db.gameTable.iter()].find((row) => !before.has(row.id)).id;
}, fixture.lobbyId);
await bob.page.evaluate(
  async ({ pokerId, member }) =>
    window.proofDb.reducers.joinTable({
      tableId: pokerId,
      lobbyMemberId: member,
      buyIn: 1000,
    }),
  { pokerId, member: `member_${fixture.lobbyId}_${bob.actor.clientId}` },
);
async function openTable(person, tableId) {
  await person.page.evaluate((tableId) => {
    const room = JSON.parse(localStorage.getItem('lastRoom'));
    room.tableId = tableId;
    localStorage.setItem('lastRoom', JSON.stringify(room));
  }, tableId);
  await person.page.goto(base + '/' + fixture.room);
  await person.page.waitForTimeout(1700);
  await api(person.page);
}
await Promise.all([openTable(alice, pokerId), openTable(bob, pokerId)]);
await capture(alice.page, '11-full-countdown-desktop');
await capture(bob.page, '12-full-countdown-mobile');
await alice.page.waitForFunction(
  (id) =>
    JSON.parse(window.proofDb.db.gameTable.id.find(id).stateJson).phase ===
    'play',
  pokerId,
  { timeout: 16000 },
);
await alice.page.waitForTimeout(700);
await capture(alice.page, '13-funded-poker-desktop');
await capture(bob.page, '14-funded-poker-mobile');
let state = await alice.page.evaluate(
  (id) => JSON.parse(window.proofDb.db.gameTable.id.find(id).stateJson),
  pokerId,
);
const actor = state.turnSeatIndex === 0 ? alice : bob;
await actor.page.evaluate(
  async ({ id, client }) =>
    window.proofDb.reducers.handleGameIntent({
      tableId: id,
      clientId: client,
      intentPayload: JSON.stringify({ type: 'fold' }),
    }),
  { id: pokerId, client: actor.actor.clientId },
);
await alice.page.waitForFunction(
  (id) =>
    JSON.parse(window.proofDb.db.gameTable.id.find(id).stateJson).phase ===
    'finished',
  pokerId,
);
await capture(alice.page, '15-settled-poker-result');
for (const person of [alice, bob])
  await person.page.evaluate(
    async ({ id, member }) =>
      window.proofDb.reducers.leaveTable({
        tableId: id,
        lobbyMemberId: member,
      }),
    {
      id: pokerId,
      member: `member_${fixture.lobbyId}_${person.actor.clientId}`,
    },
  );
// Single-player seat at a real multiplayer Blackjack table, funded from the same wallet.
let insuranceCaptured = false,
  splitCaptured = false;
for (
  let attempt = 0;
  attempt < 70 && (!insuranceCaptured || !splitCaptured);
  attempt++
) {
  const id = await alice.page.evaluate(async (lobbyId) => {
    const db = window.proofDb;
    const known = new Set([...db.db.gameTable.iter()].map((row) => row.id));
    await db.reducers.createGameTable({
      lobbyId,
      gameType: 'blackjack',
      settings: JSON.stringify({
        name: 'House rules',
        maxPlayers: 2,
        minBet: 25,
        maxBet: 100,
        minBuyIn: 200,
        maxBuyIn: 2000,
        buyIn: 400,
      }),
    });
    return [...db.db.gameTable.iter()].find((row) => !known.has(row.id)).id;
  }, fixture.lobbyId);
  async function action(move) {
    await alice.page.evaluate(
      async ({ id, client, move }) =>
        window.proofDb.reducers.handleGameIntent({
          tableId: id,
          clientId: client,
          intentPayload: JSON.stringify(move),
        }),
      { id, client: alice.actor.clientId, move },
    );
  }
  await action({ type: 'start_game' });
  await action({ type: 'bet', amount: 25 });
  let game = await alice.page.evaluate(
    (id) => JSON.parse(window.proofDb.db.gameTable.id.find(id).stateJson),
    id,
  );
  if (game.step === 'insurance' && !insuranceCaptured) {
    await openTable(alice, id);
    await capture(alice.page, '16-blackjack-insurance');
    insuranceCaptured = true;
  }
  if (game.step === 'insurance') {
    await action({ type: 'insurance', take: false });
    game = await alice.page.evaluate(
      (id) => JSON.parse(window.proofDb.db.gameTable.id.find(id).stateJson),
      id,
    );
  }
  const cards = game.seats['0'].hands[0].cards;
  const value = (card) =>
    ['10', 'J', 'Q', 'K'].includes(card.slice(0, -1)) ? 10 : card.slice(0, -1);
  if (
    game.phase === 'play' &&
    cards.length === 2 &&
    value(cards[0]) === value(cards[1]) &&
    !splitCaptured
  ) {
    await action({ type: 'split' });
    await openTable(alice, id);
    await capture(alice.page, '17-blackjack-split');
    splitCaptured = true;
  }
  for (let step = 0; step < 5; step++) {
    game = await alice.page.evaluate(
      (id) => JSON.parse(window.proofDb.db.gameTable.id.find(id).stateJson),
      id,
    );
    if (game.phase === 'finished') break;
    await action(
      game.step === 'insurance'
        ? { type: 'insurance', take: false }
        : { type: 'stand' },
    );
  }
  await alice.page.evaluate(
    async ({ id, member }) =>
      window.proofDb.reducers.leaveTable({
        tableId: id,
        lobbyMemberId: member,
      }),
    { id, member: `member_${fixture.lobbyId}_${alice.actor.clientId}` },
  );
  await alice.page.waitForTimeout(200);
}
assert.ok(
  insuranceCaptured && splitCaptured,
  'Captured live insurance and split controls',
);
for (const person of [alice, bob]) await openTable(person, '');
await capture(alice.page, '18-cross-game-leaderboard-desktop');
await capture(bob.page, '19-cross-game-leaderboard-mobile');
// A fresh low-stakes room makes the refill/ranking distinction visible in the UI.
const refillRoom = await alice.page.evaluate(async () => {
  const db = window.proofDb;
  const known = new Set([...db.db.lobby.iter()].map((row) => row.id));
  await db.reducers.createLobby({ startingCoins: 20 });
  return [...db.db.lobby.iter()].find((row) => !known.has(row.id));
});
for (const person of [alice, bob])
  await person.page.evaluate(
    async ({ room, actor }) => {
      await window.proofDb.reducers.joinLobby({
        lobbyCode: room.code,
        clientId: actor.clientId,
        name: actor.name,
      });
    },
    {
      room: refillRoom,
      actor: { clientId: person.actor.clientId, name: person.actor.name },
    },
  );
const refillTable = await alice.page.evaluate(async (lobbyId) => {
  const db = window.proofDb;
  await db.reducers.createGameTable({
    lobbyId,
    gameType: 'bluff',
    settings: JSON.stringify({
      name: 'Refill proof',
      maxPlayers: 3,
      entryFee: 20,
    }),
  });
  return [...db.db.gameTable.iter()].find((row) => row.lobbyId === lobbyId).id;
}, refillRoom.id);
await bob.page.evaluate(
  async ({ tableId, memberId }) =>
    window.proofDb.reducers.joinTable({ tableId, lobbyMemberId: memberId }),
  {
    tableId: refillTable,
    memberId: `member_${refillRoom.id}_${bob.actor.clientId}`,
  },
);
await alice.page.evaluate(
  async ({ tableId, clientId }) =>
    window.proofDb.reducers.handleGameIntent({
      tableId,
      clientId,
      intentPayload: JSON.stringify({ type: 'start_game' }),
    }),
  { tableId: refillTable, clientId: alice.actor.clientId },
);
const { strategyFor } = await import('../src/shared/games/bots/registry.ts');
const strategy = strategyFor('bluff');
for (let turn = 0; turn < 2000; turn++) {
  const previous = await alice.page.evaluate(
    (id) => window.proofDb.db.gameTable.id.find(id).stateJson,
    refillTable,
  );
  const game = JSON.parse(previous);
  if (game.phase === 'finished') break;
  const seatIndex = strategy.actingSeats(game)[0];
  const person = seatIndex === 0 ? alice : bob;
  await person.page.evaluate(
    async ({ tableId, clientId, move }) =>
      window.proofDb.reducers.handleGameIntent({
        tableId,
        clientId,
        intentPayload: JSON.stringify(move),
      }),
    {
      tableId: refillTable,
      clientId: person.actor.clientId,
      move: strategy.choose(game, seatIndex),
    },
  );
  await alice.page.waitForFunction(
    ({ id, previous }) =>
      window.proofDb.db.gameTable.id.find(id).stateJson !== previous,
    { id: refillTable, previous },
  );
}
const loserId = await alice.page.evaluate(
  (lobbyId) =>
    [...window.proofDb.db.roomWallet.iter()].find(
      (row) => row.lobbyId === lobbyId && row.available === 0n,
    ).clientId,
  refillRoom.id,
);
const loser = loserId === alice.actor.clientId ? alice : bob;
await loser.page.evaluate(
  async ({ lobbyId, clientId }) => {
    const db = window.proofDb;
    const before = [...db.db.roomWallet.iter()].find(
      (row) => row.lobbyId === lobbyId && row.clientId === clientId,
    ).profit;
    await db.reducers.refillRoomCoins({ lobbyId, clientId });
    const wallet = [...db.db.roomWallet.iter()].find(
      (row) => row.lobbyId === lobbyId && row.clientId === clientId,
    );
    if (
      wallet.profit !== before ||
      wallet.granted !== 80n ||
      wallet.available !== 40n
    )
      throw new Error('Refill changed profit or grants incorrectly');
  },
  { lobbyId: refillRoom.id, clientId: loser.actor.clientId },
);
for (const person of [alice, bob]) {
  await person.page.evaluate(
    ({ code, name }) =>
      localStorage.setItem(
        'lastRoom',
        JSON.stringify({ lobbyCode: code, name, tableId: '' }),
      ),
    { code: refillRoom.code, name: person.actor.name },
  );
  await person.page.goto(base + '/' + refillRoom.code);
  await person.page.waitForTimeout(1500);
}
await capture(loser.page, '20-tracked-refill-ranking');
await capture(
  loser === alice ? bob.page : alice.page,
  '21-pooled-prize-winner',
);
assert.deepEqual(failures, [], 'No browser rendering errors');
writeFileSync(
  out + '/browser-proof.json',
  JSON.stringify(
    {
      chromiumDesktop: true,
      mobileViewport: '844x390',
      users: 2,
      liveCountdown: true,
      liveCasinoWallets: true,
      blackjackInsurance: insuranceCaptured,
      blackjackSplit: splitCaptured,
      renderingErrors: failures,
      trackedRefillKeepsProfit: true,
    },
    null,
    2,
  ),
);
await browser.close();
console.log('BROWSER PROOFS PASSED');
