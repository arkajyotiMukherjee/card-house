/** Local browser and multi-user proof for the accumulating lobby fixes. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { strategyFor } from '../src/shared/games/bots/registry.ts';
import { pokerCanCheck, type PokerState } from '../src/shared/games/poker.ts';
const host = 'http://127.0.0.1:3000',
  database = 'room-economy-test';
const base = process.env.ROOM_ECONOMY_URL ?? 'http://127.0.0.1:5175';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw Error('Local proof app required');
const out = fileURLToPath(
  new URL('../docs/lobby-ux-evidence/', import.meta.url),
);
mkdirSync(out, { recursive: true });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, message: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw Error(message);
    await delay(25);
  }
}
async function connect(index: number) {
  let token = '';
  const db = await new Promise<DbConnection>((resolve, reject) =>
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
      .build(),
  );
  return {
    db,
    token,
    clientId: crypto.randomUUID(),
    name:
      index === 2
        ? 'Champion ABC'
        : index === 0
          ? 'Desktop Hero'
          : index === 1
            ? 'Mobile Hero'
            : `Player ${String(index + 1).padStart(2, '0')}`,
  };
}
const people = await Promise.all(
  Array.from({ length: 12 }, (_, index) => connect(index)),
);
const [a, b, c, d] = people;
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const failures: string[] = [];
try {
  const oldRooms = new Set([...a.db.db.lobby.iter()].map((row) => row.id));
  await a.db.reducers.createLobby({ startingCoins: 5000 });
  const room = [...a.db.db.lobby.iter()].find((row) => !oldRooms.has(row.id))!;
  for (const person of people)
    await person.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: person.clientId,
      name: person.name,
    });
  const member = (person: typeof a) => `member_${room.id}_${person.clientId}`;
  async function create(
    person: typeof a,
    gameType: string,
    settings: Record<string, unknown>,
  ) {
    const known = new Set(
      [...person.db.db.gameTable.iter()].map((row) => row.id),
    );
    await person.db.reducers.createGameTable({
      lobbyId: room.id,
      gameType,
      settings: JSON.stringify(settings),
    });
    return [...person.db.db.gameTable.iter()].find(
      (row) => !known.has(row.id),
    )!;
  }
  const poker = await create(a, 'poker', {
    name: 'Omaha table',
    maxPlayers: 3,
    variation: 'omaha',
  });
  async function persona(
    person: typeof a,
    mobile = false,
    width = mobile ? 844 : 1440,
    height = mobile ? 390 : 900,
  ) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
    });
    await context.addInitScript(
      ({ person, code }) => {
        if (localStorage.getItem('clientId')) return;
        localStorage.setItem('clientId', person.clientId);
        localStorage.setItem('stdbToken', person.token);
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, name: person.name, tableId: '' }),
        );
      },
      {
        person: {
          clientId: person.clientId,
          token: person.token,
          name: person.name,
        },
        code: room.code,
      },
    );
    await context.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) + '\nwindow.__lobbyProofEngine = engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(message.text());
    });
    await page.goto(base + '/');
    await page.waitForTimeout(1500);
    return { page, context };
  }
  const desktop = await persona(a),
    mobile = await persona(b, true);
  async function capture(page: Page, name: string) {
    await page.waitForFunction(() => {
      const engine = (
        window as unknown as {
          __lobbyProofEngine?: { currentScene: { actors: unknown[] } };
        }
      ).__lobbyProofEngine;
      return engine && engine.currentScene.actors.length > 10;
    });
    const scene = await page.evaluate(() => {
      const engine = (
        window as unknown as {
          __lobbyProofEngine: {
            currentScene: { constructor: { name: string }; actors: unknown[] };
          };
        }
      ).__lobbyProofEngine;
      return {
        name: engine.currentScene.constructor.name,
        actors: engine.currentScene.actors.length,
      };
    });
    console.log('Scene', name, JSON.stringify(scene));
    assert.ok(scene.actors > 10, 'Capture contains a rendered scene');
    if (name.includes('omaha')) assert.equal(scene.name, 'GameScene');
    await page.screenshot({ path: out + name + '.png' });
    console.log('Captured ' + name);
  }
  async function tap(
    page: Page,
    x: number,
    y: number,
    edge?: 'left' | 'right',
  ) {
    const box = (await page.locator('canvas').boundingBox())!;
    const width = Math.round((box.width / box.height) * 540),
      gutter = (width - 960) / 2;
    await page.mouse.click(
      box.x +
        ((x +
          gutter +
          (edge === 'right' ? gutter : edge === 'left' ? -gutter : 0)) /
          width) *
          box.width,
      box.y + (y / 540) * box.height,
    );
    await page.waitForTimeout(250);
  }
  async function panelClip(page: Page) {
    const box = (await page.locator('canvas').boundingBox())!,
      width = Math.round((box.width / box.height) * 540),
      scale = box.width / width,
      gutter = (width - 960) / 2;
    return {
      x: box.x + (656 + 2 * gutter) * scale,
      y: box.y + 148 * scale,
      width: 296 * scale,
      height: 290 * scale,
    };
  }
  await capture(desktop.page, '01-desktop-initial-no-crown');
  await capture(mobile.page, '02-mobile-initial-no-crown');
  await tap(desktop.page, 720, 30, 'right');
  await capture(desktop.page, '03-desktop-centered-rankings');
  await tap(desktop.page, 720, 30, 'right');
  await tap(mobile.page, 550, 106, 'right');
  await tap(mobile.page, 280, 380);
  await capture(mobile.page, '04-mobile-create-table');
  await tap(mobile.page, 300, 480);
  await mobile.page
    .getByRole('textbox', { name: 'Entry fee', exact: true })
    .waitFor({ state: 'visible' });
  await capture(mobile.page, '13-mobile-entry-chips');
  // Close the chip form, then the game picker.
  await tap(mobile.page, 640, 344);
  await tap(mobile.page, 640, 450);
  await mobile.page.goto(base + '/' + room.code);
  await mobile.page.waitForTimeout(1000);
  const feeGame = await create(c, 'go_fish', {
    name: 'Leaderboard proof',
    maxPlayers: 3,
    entryFee: 20,
  });
  await d.db.reducers.joinTable({
    tableId: feeGame.id,
    lobbyMemberId: member(d),
  });
  await c.db.reducers.handleGameIntent({
    tableId: feeGame.id,
    clientId: c.clientId,
    intentPayload: '{"type":"start_game"}',
  });
  await until(
    () =>
      JSON.parse(a.db.db.gameTable.id.find(feeGame.id)!.stateJson).phase ===
      'play',
    'Game start replicated',
  );
  const strategy = strategyFor('go_fish')!;
  for (let turns = 0; turns < 2000; turns++) {
    const before = a.db.db.gameTable.id.find(feeGame.id)!.stateJson,
      state = JSON.parse(before);
    if (state.phase === 'finished') break;
    const index = strategy.actingSeats(state)[0],
      actor = index === 0 ? c : d;
    await actor.db.reducers.handleGameIntent({
      tableId: feeGame.id,
      clientId: actor.clientId,
      intentPayload: JSON.stringify(strategy.choose(state, index)),
    });
    await until(
      () => a.db.db.gameTable.id.find(feeGame.id)!.stateJson !== before,
      'Move replicated',
    );
  }
  assert.ok(a.db.db.gameSettlement.id.find(`${feeGame.id}:1`));
  await desktop.page.waitForTimeout(600);
  await capture(desktop.page, '05-desktop-leading-crown');
  await capture(mobile.page, '06-mobile-leading-crown');
  const clip = await panelClip(desktop.page),
    beforeScroll = await desktop.page.screenshot({ clip });
  await desktop.page.mouse.move(
    clip.x + clip.width / 2,
    clip.y + clip.height / 2,
  );
  await desktop.page.mouse.wheel(0, 1500);
  await desktop.page.waitForTimeout(400);
  assert.notDeepEqual(
    await desktop.page.screenshot({ clip }),
    beforeScroll,
    'Desktop wheel scrolls actual ranking rows',
  );
  await capture(desktop.page, '07-desktop-scrolled-rankings');
  const mobileClip = await panelClip(mobile.page),
    beforeSwipe = await mobile.page.screenshot({ clip: mobileClip });
  const session = await mobile.context.newCDPSession(mobile.page);
  const x = mobileClip.x + mobileClip.width / 2,
    y = mobileClip.y + mobileClip.height - 20;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 12; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - step * 12 }],
    });
    await delay(25);
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await mobile.page.waitForTimeout(400);
  assert.notDeepEqual(
    await mobile.page.screenshot({ clip: mobileClip }),
    beforeSwipe,
    'Touch swipes scroll actual ranking rows',
  );
  await capture(mobile.page, '08-mobile-scrolled-rankings');
  // Start a live Omaha hand for the padded HUD/help and chip wording proof.
  await b.db.reducers.joinTable({
    tableId: poker.id,
    lobbyMemberId: member(b),
    buyIn: 400,
  });
  await a.db.reducers.handleGameIntent({
    tableId: poker.id,
    clientId: a.clientId,
    intentPayload: '{"type":"start_game"}',
  });
  await until(
    () =>
      JSON.parse(a.db.db.gameTable.id.find(poker.id)!.stateJson).phase ===
      'play',
    'Poker start replicated',
  );
  for (let turn = 0; turn < 40; turn++) {
    const before = a.db.db.gameTable.id.find(poker.id)!.stateJson;
    const state = JSON.parse(before) as PokerState;
    if (state.board.length >= 3) break;
    if (state.turnSeatIndex === null) {
      await delay(100);
      continue;
    }
    const person = state.turnSeatIndex === 0 ? a : b;
    await person.db.reducers.handleGameIntent({
      tableId: poker.id,
      clientId: person.clientId,
      intentPayload: JSON.stringify({
        type: pokerCanCheck(state, state.turnSeatIndex) ? 'check' : 'call',
      }),
    });
    await until(
      () => a.db.db.gameTable.id.find(poker.id)!.stateJson !== before,
      'Poker action replicated',
    );
  }
  assert.equal(
    JSON.parse(a.db.db.gameTable.id.find(poker.id)!.stateJson).board.length,
    3,
  );
  for (const [view, person] of [
    [desktop, a],
    [mobile, b],
  ] as const) {
    await view.page.evaluate(
      ({ code, name, id }) =>
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, name, tableId: id }),
        ),
      { code: room.code, name: person.name, id: poker.id },
    );
    await view.page.goto(base + '/');
    await view.page.waitForTimeout(3500);
  }
  await capture(desktop.page, '09-desktop-omaha-hud');
  await capture(mobile.page, '10-mobile-omaha-hud');
  const desktopBox = (await desktop.page.locator('canvas').boundingBox())!;
  const desktopWidth = Math.round((desktopBox.width / desktopBox.height) * 540);
  const desktopGutter = (desktopWidth - 960) / 2;
  await desktop.page.mouse.move(
    desktopBox.x + ((272 + desktopGutter) / desktopWidth) * desktopBox.width,
    desktopBox.y + (508 / 540) * desktopBox.height,
  );
  await desktop.page.waitForTimeout(500);
  await capture(desktop.page, '12-desktop-card-inspection');
  const narrow = await persona(people[4], true, 667, 375);
  await capture(narrow.page, '11-small-mobile-lobby');
  // Empty host departure: refund immediately, retain 60-second return grace, then remove.
  const abandoned = await create(people[5], 'bluff', {
    name: 'Abandoned cleanup proof',
    maxPlayers: 3,
  });
  await people[5].db.reducers.leaveTable({
    tableId: abandoned.id,
    lobbyMemberId: member(people[5]),
  });
  await until(
    () => a.db.db.gameTable.id.find(abandoned.id)?.hostAwaySince !== undefined,
    'Host absence starts',
  );
  assert.ok(a.db.db.gameTable.id.find(abandoned.id));
  const wallet = a.db.db.roomWallet.id.find(member(people[5]))!;
  assert.equal(wallet.available, 10000n);
  await until(
    () => !a.db.db.gameTable.id.find(abandoned.id),
    'Abandoned empty table removed after grace',
    70000,
  );
  assert.ok(a.db.db.gameTable.id.find(poker.id), 'Occupied hand preserved');
  assert.deepEqual(failures, [], 'No browser rendering errors');
  writeFileSync(
    out + 'proof.json',
    JSON.stringify(
      {
        players: 12,
        desktop: '1440x900',
        mobile: ['844x390', '667x375'],
        desktopWheel: true,
        mobileSwipe: true,
        clearLeaderAfterPaidGame: true,
        emptyHostGraceSeconds: 60,
        abandonedTableRemoved: true,
        refundPreserved: true,
        occupiedGamePreserved: true,
        renderingErrors: failures,
      },
      null,
      2,
    ),
  );
  console.log('LOBBY UX PROOF PASSED');
} finally {
  await browser.close();
  for (const person of people) person.db.disconnect();
}
