import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { FLOOR_STEP_MS, tableEntrance } from '../src/shared/casino-floor.ts';

const base = process.env.CASINO_BROWSER_URL ?? 'http://127.0.0.1:5181';
const host = process.env.SPACETIMEDB_HOST ?? 'http://127.0.0.1:3000';
const database = process.env.SPACETIMEDB_DB ?? 'room-economy-test';
const evidence =
  process.env.CASINO_EVIDENCE_DIR ?? '/tmp/cardhouse-casino-proof';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(host, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(database, /^room-economy-/);
mkdirSync(evidence, { recursive: true });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  return new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((db) =>
        db
          .subscriptionBuilder()
          .onApplied(() => resolve(db))
          .onError(reject)
          .subscribe([
            'SELECT * FROM Lobby',
            'SELECT * FROM GameTable',
            'SELECT * FROM GameSeat',
            'SELECT * FROM LobbyChatMessage',
            'SELECT * FROM CasinoPresence',
            'SELECT * FROM CasinoTableSpot',
          ]),
      )
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
}

async function until(test: () => boolean, error: string) {
  const deadline = Date.now() + 9000;
  while (!test()) {
    assert.ok(Date.now() < deadline, error);
    await pause(50);
  }
}
async function point(page: Page, x: number, y: number, touch = false) {
  const region = await page.locator('canvas').boundingBox();
  assert.ok(region);
  const left = region.x + (x * region.width) / 960;
  const top = region.y + (y * region.height) / 540;
  if (touch) await page.touchscreen.tap(left, top);
  else await page.mouse.click(left, top);
  await pause(180);
}
function view(page: Page, name: string) {
  return page.screenshot({ path: join(evidence, name + '.png') });
}
const browser = await chromium.launch({
  executablePath: process.env.CASINO_CHROMIUM ?? '/usr/bin/chromium',
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
  ],
});
const errors: string[] = [];
const connections: DbConnection[] = [];
try {
  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await desktop.addInitScript(() => {
    const labels = new Set<string>();
    (window as Window & { floorProof: Set<string> }).floorProof = labels;
    const source = CanvasRenderingContext2D.prototype;
    const fillText = source.fillText;
    source.fillText = function (text, x, y, maxWidth) {
      if (
        [
          'Walk over',
          'Sit down',
          'Watch',
          'Choose the rank to declare',
          'Flush',
        ].includes(text) ||
        text.includes('seated · Host')
      )
        labels.add(text);
      fillText.call(this, text, x, y, maxWidth);
    };
  });
  desktop.on('pageerror', (e) => errors.push(e.message));
  await desktop.goto(base);
  await desktop.locator('canvas').waitFor();
  await pause(1600);
  await view(desktop, 'entrance');
  await point(desktop, 840, 42);
  await view(desktop, 'avatar-editor');
  await point(desktop, 756, 166);
  const avatarName = desktop.getByRole('textbox', {
    name: 'Display name',
    exact: true,
  });
  await avatarName.focus();
  await avatarName.fill('Ava Bennett');
  await point(desktop, 725, 450);
  assert.ok(await desktop.evaluate(() => localStorage.getItem('casinoAvatar')));
  await point(desktop, 480, 190);
  await point(desktop, 627, 355);
  await desktop.waitForFunction(() =>
    /^\/[A-Z0-9]{4}$/.test(location.pathname),
  );
  const code = new URL(desktop.url()).pathname.slice(1);

  const fixture = await connect();
  connections.push(fixture);
  const room = [...fixture.db.lobby.iter()].find((row) => row.code === code)!;
  assert.ok(room);
  const owners = [
    { name: 'Ben Harrison', table: 'Evening Bluff', game: 'bluff' },
    { name: 'Chloe Martin', table: 'Emerald Poker', game: 'poker' },
    { name: 'Dev Sharma', table: 'Grand President', game: 'president' },
  ];
  const hosts = new Map<string, { db: DbConnection; clientId: string }>();
  for (const owner of owners) {
    const db = await connect();
    connections.push(db);
    const clientId = crypto.randomUUID();
    hosts.set(owner.game, { db, clientId });
    await db.reducers.joinLobby({
      lobbyCode: code,
      clientId,
      name: owner.name,
    });
    await db.reducers.enterCasinoFloor({ lobbyId: room.id });
    await db.reducers.createGameTable({
      lobbyId: room.id,
      gameType: owner.game,
      settings: JSON.stringify({ name: owner.table, maxPlayers: 6 }),
    });
  }
  const player = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  });
  player.on('pageerror', (e) => errors.push(e.message));
  await player.goto(base);
  await point(player, 850, 42, true);
  const mobileAvatarName = player.getByRole('textbox', {
    name: 'Display name',
    exact: true,
  });
  await mobileAvatarName.focus();
  await mobileAvatarName.fill('Finn Walker');
  await point(player, 725, 450, true);
  await player.goto(`${base}/${code}`);
  await player
    .getByRole('textbox', { name: 'Room Code', exact: true })
    .waitFor();
  await point(player, 620, 433, true);
  try {
    await player.waitForFunction(
      () => localStorage.getItem('lastRoom')?.includes('Finn Walker'),
      undefined,
      { timeout: 5000 },
    );
  } catch (error) {
    await view(player, 'mobile-join-debug');
    throw error;
  }
  await pause(900);
  await view(player, 'mobile-reception');

  await desktop.keyboard.press('/');
  const quick = desktop.locator(
    'input[data-cardhouse-field="casino-chat"]:focus',
  );
  await quick.waitFor({ timeout: 4000 });
  await quick.fill('Anyone for Bluff?');
  await quick.press('Enter');
  await until(
    () =>
      [...fixture.db.lobbyChatMessage.iter()].some(
        (row) => row.lobbyId === room.id && row.body === 'Anyone for Bluff?',
      ),
    'Room chat delivered',
  );
  await pause(300);
  await view(desktop, 'reception-chat');
  await point(player, 620, 23, true);
  const phoneChat = player.locator('input[data-cardhouse-field="casino-chat"]');
  await phoneChat.fill('Ready to play');
  await phoneChat.press('Enter');
  await until(
    () =>
      [...fixture.db.lobbyChatMessage.iter()].some(
        (row) => row.lobbyId === room.id && row.body === 'Ready to play',
      ),
    'Touch chat delivered',
  );
  await view(player, 'mobile-chat');
  await point(player, 620, 23, true);
  await point(player, 852, 420, true);
  const phoneClient = await player.evaluate(() =>
    localStorage.getItem('clientId'),
  );
  await until(
    () =>
      [...fixture.db.casinoPresence.iter()].some(
        (row) =>
          row.id.endsWith(phoneClient ?? 'no-client') &&
          JSON.parse(row.pathJson).at(-1)?.y === 18,
      ),
    'Touch walk to gaming wing',
  );
  await pause(2200);
  await view(player, 'mobile-gaming-wing');

  await point(desktop, 337, 396);
  const ownClient = await desktop.evaluate(() =>
    localStorage.getItem('clientId'),
  );
  await until(
    () =>
      [...fixture.db.casinoPresence.iter()].some(
        (row) =>
          row.id.endsWith(ownClient ?? 'no-client') &&
          JSON.parse(row.pathJson).at(-1)?.y === 18,
      ),
    'Avatar walked toward the gaming wing',
  );
  await pause(2200);
  await view(desktop, 'gaming-wing');
  await desktop.evaluate(() =>
    (window as Window & { floorProof: Set<string> }).floorProof.clear(),
  );
  await point(desktop, 421, 23);
  await view(desktop, 'table-directory');
  const controls = await desktop.evaluate(() => [
    ...(window as Window & { floorProof: Set<string> }).floorProof,
  ]);
  assert.ok(
    controls.includes('Walk over'),
    'Directory offers to walk from a distance',
  );
  assert.ok(
    !controls.includes('Sit down') && !controls.includes('Watch'),
    'Distant tables have no join or watch controls',
  );

  const bluff = [...fixture.db.gameTable.iter()].find(
    (table) => table.lobbyId === room.id && table.gameType === 'bluff',
  )!;
  assert.ok(bluff);
  const seated = () =>
    [...fixture.db.gameSeat.iter()].some(
      (row) =>
        row.tableId === bluff.id &&
        row.lobbyMemberId.endsWith(ownClient ?? 'no-client'),
    );
  // The directory offers a walk from a distance. Joining starts at the table.
  await point(desktop, 580, 134);
  const spot = [...fixture.db.casinoTableSpot.iter()].find(
    (row) => row.id === bluff.id,
  );
  assert.ok(spot);
  const entrance = tableEntrance(spot.slot);
  await until(() => {
    const position = [...fixture.db.casinoPresence.iter()].find(
      (row) =>
        row.lobbyId === room.id && row.id.endsWith(ownClient ?? 'no-client'),
    );
    if (!position) return false;
    const route = JSON.parse(position.pathJson);
    const arrived =
      Date.now() >=
      Number(position.startedAt.microsSinceUnixEpoch / 1000n) +
        route.length * FLOOR_STEP_MS;
    const end = route.at(-1) ?? position;
    return arrived && end.x === entrance.x && end.y === entrance.y;
  }, 'Walked to the table before joining');
  await point(desktop, 798, 495);
  assert.equal(
    seated(),
    false,
    'Opening a paid table confirmation never buys a seat',
  );
  await view(desktop, 'paid-join');
  await point(desktop, 625, 344);
  await until(seated, 'Seat reserved after confirming the paid join');
  await desktop.waitForFunction(
    () => !!JSON.parse(localStorage.getItem('lastRoom') ?? '{}').tableId,
  );
  await pause(600);
  await view(desktop, 'table-lobby');
  const bluffHost = hosts.get('bluff')!;
  await bluffHost.db.reducers.handleGameIntent({
    tableId: bluff.id,
    clientId: bluffHost.clientId,
    intentPayload: JSON.stringify({ type: 'start_game' }),
  });
  await until(
    () => fixture.db.gameTable.id.find(bluff.id)?.status.tag === 'InProgress',
    'Multiplayer Bluff dealt',
  );
  await desktop.waitForFunction(() =>
    ['Choose the rank to declare', 'Flush'].some((label) =>
      (window as Window & { floorProof: Set<string> }).floorProof.has(label),
    ),
  );
  await view(desktop, 'bluff-table');
  await desktop.evaluate(() =>
    (window as Window & { floorProof: Set<string> }).floorProof.clear(),
  );
  await point(desktop, 86, 35);
  await desktop.waitForFunction(
    () => !JSON.parse(localStorage.getItem('lastRoom') ?? '{}').tableId,
  );
  assert.ok(
    [...fixture.db.gameSeat.iter()].some(
      (row) =>
        row.tableId === bluff.id &&
        row.lobbyMemberId.endsWith(ownClient ?? 'no-client') &&
        row.seatState?.tag === 'Disconnected',
    ),
    'The running hand retains a disconnected reservation',
  );
  await desktop.waitForFunction(
    () =>
      [...(window as Window & { floorProof: Set<string> }).floorProof].some(
        (text) => text.includes('1/6 seated'),
      ),
    undefined,
    { timeout: 4000 },
  );
  assert.deepEqual(errors, []);
  console.log(
    'Desktop and touch multiplayer verified. Captures saved to',
    evidence,
  );
} finally {
  await browser.close();
  connections.forEach((db) => db.disconnect());
}
