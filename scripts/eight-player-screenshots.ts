/** Actual eight-player Omaha table; captures the current desktop and phone UI. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { pokerCanCheck } from '../src/shared/games/poker.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = fileURLToPath(
  new URL('../docs/lobby-ux-evidence/', import.meta.url),
);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string) {
  const end = Date.now() + 20000;
  while (!check()) {
    if (Date.now() > end) throw Error(label);
    await delay(25);
  }
}
async function connect(name: string) {
  let token = '';
  const db = await new Promise<DbConnection>((resolve, reject) =>
    DbConnection.builder()
      .withUri('http://127.0.0.1:3000')
      .withDatabaseName('room-economy-test')
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
  return { db, name, token, clientId: crypto.randomUUID() };
}
const people = await Promise.all(
  [
    'Ava Bennett',
    'Ben Harrison',
    'Chloe Martin',
    'Dev Sharma',
    'Ella Johnson',
    'Finn Walker',
    'Gia Williams',
    'Hugo Ramirez',
  ].map(connect),
);
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const host = people[0],
    db = host.db.db;
  const known = new Set([...db.lobby.iter()].map((row) => row.id));
  await host.db.reducers.createLobby({ startingCoins: 10000 });
  const room = [...db.lobby.iter()].find(
    (row) =>
      !known.has(row.id) &&
      row.creatorIdentity === host.db.identity!.toHexString(),
  )!;
  for (const person of people)
    await person.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: person.clientId,
      name: person.name,
    });
  await host.db.reducers.createGameTable({
    lobbyId: room.id,
    gameType: 'poker',
    settings: JSON.stringify({
      name: 'Eight player Omaha',
      maxPlayers: 8,
      variation: 'omaha',
    }),
  });
  const table = [...db.gameTable.iter()].find(
    (row) => row.lobbyId === room.id,
  )!;
  for (const person of people.slice(1))
    await person.db.reducers.joinTable({
      tableId: table.id,
      lobbyMemberId: `member_${room.id}_${person.clientId}`,
    });
  const row = () => db.gameTable.id.find(table.id)!;
  const state = () => JSON.parse(row().stateJson);
  const move = async (index: number, intent: unknown) => {
    const before = row().stateJson;
    await people[index].db.reducers.handleGameIntent({
      tableId: table.id,
      clientId: people[index].clientId,
      intentPayload: JSON.stringify(intent),
    });
    await until(() => row().stateJson !== before, 'Action replicated');
  };
  await until(
    () =>
      [...db.gameSeat.iter()].filter((seat) => seat.tableId === table.id)
        .length === 8,
    'All eight seats replicated',
  );
  assert.equal(
    [...db.gameSeat.iter()].filter((seat) => seat.tableId === table.id).length,
    8,
  );
  await move(0, { type: 'start_game' });
  const step = async () => {
    const current = state();
    if (current.turnSeatIndex === null) {
      await delay(50);
      return;
    }
    await move(current.turnSeatIndex, {
      type:
        current.street === 'preflop' && [2, 6].includes(current.turnSeatIndex)
          ? 'fold'
          : pokerCanCheck(current, current.turnSeatIndex)
            ? 'check'
            : 'call',
    });
  };
  while (state().board.length < 3) await step();
  const views = [];
  const errors: string[] = [];
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      ({ person, code, tableId }) => {
        if (localStorage.getItem('clientId')) return;
        localStorage.setItem('clientId', person.clientId);
        localStorage.setItem('stdbToken', person.token);
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, name: person.name, tableId }),
        );
      },
      {
        person: { name: host.name, clientId: host.clientId, token: host.token },
        code: room.code,
        tableId: table.id,
      },
    );
    await context.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()) + '\nwindow.__eightPlayerEngine = engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('BROWSER ERROR:', error.message);
    });
    await page.goto('http://127.0.0.1:5175/');
    await page.waitForFunction(
      (id) =>
        window.__eightPlayerEngine?.currentScene.lastRow?.id === id &&
        window.__eightPlayerEngine.currentScene.placed.length === 8,
      table.id,
    );
    views.push({ page, mobile });
  }
  const capture = async (phase: string) =>
    Promise.all(
      views.map(async ({ page, mobile }) => {
        await page.waitForTimeout(700);
        await page.screenshot({
          path: `${out}39-eight-player-${mobile ? 'mobile' : 'desktop'}-${phase}.png`,
        });
      }),
    );
  await capture('flop');
  while (state().phase !== 'finished') await step();
  for (const { page } of views)
    await page.waitForFunction(
      () =>
        window.__eightPlayerEngine.currentScene.pokerDriver.state?.phase ===
        'finished',
    );
  await capture('showdown');
  const eligible = state().order.filter(
    (index) => !state().seats[String(index)].folded,
  );
  assert.equal(eligible.length, 6);
  for (const { page } of views) {
    const data = await page.evaluate(() => {
      const scene = window.__eightPlayerEngine.currentScene;
      const names = scene.actors.filter(
        (actor) => actor.name === 'poker-player-name',
      );
      const svg = document
        .querySelector('[data-cardhouse-shell="fab"] svg')
        .getBoundingClientRect();
      const button = document
        .querySelector('[data-cardhouse-shell="fab"]')
        .getBoundingClientRect();
      return {
        selected: scene.pokerDriver.tableUi.reviewSeat,
        names: names.map((actor) => ({
          text: actor.graphics.current.text,
          width: actor.graphics.current.width,
          size: actor.graphics.current.font.size,
        })),
        centeredIcon:
          Math.abs(svg.x + svg.width / 2 - button.x - button.width / 2) < 0.1 &&
          Math.abs(svg.y + svg.height / 2 - button.y - button.height / 2) < 0.1,
        ownCardsOnly: [...scene.pokerDriver.cards.values()].every(
          (card) => card.personal,
        ),
        personalBottomBand:
          [...scene.pokerDriver.cards.values()].every(
            (card) => card.home.y >= 396,
          ) &&
          [
            ...scene.pokerDriver.buttons,
            ...scene.pokerDriver.stakeButtons,
          ].every(
            (button) =>
              button.box.y >= 396 && button.box.y + button.box.h <= 540,
          ),
        roomWalletHidden: !scene.actors.some((actor) =>
          /^Room (chips|coins)/.test(actor.graphics.current?.text ?? ''),
        ),
        reviewCards: scene.actors.filter(
          (actor) => actor.name === 'showdown-card',
        ).length,
      };
    });
    assert.ok(eligible.includes(data.selected));
    assert.equal(data.ownCardsOnly, true);
    assert.equal(data.personalBottomBand, true);
    assert.equal(data.roomWalletHidden, true);
    assert.equal(data.reviewCards, 4);
    assert.equal(data.names.length, 8);
    for (const name of data.names) {
      assert.ok(name.width <= 164);
      assert.ok(name.size >= 18);
    }
    const viewport = page.viewportSize();
    if (viewport.width === 844) assert.equal(data.centeredIcon, true);
    const box = await page.locator('canvas').boundingBox();
    const logicalWidth = (box.width / box.height) * 540;
    const gutter = (logicalWidth - 960) / 2;
    await page.mouse.click(
      box.x + ((703 + gutter) / logicalWidth) * box.width,
      box.y + (180 / 540) * box.height,
    );
    const selected = await page.evaluate(
      () =>
        window.__eightPlayerEngine.currentScene.pokerDriver.tableUi.reviewSeat,
    );
    assert.notEqual(selected, data.selected);
    assert.ok(eligible.includes(selected));
  }
  // Finish a fresh heads-up hand by folding. Its winner must have no public card tray.
  for (const person of people)
    await person.db.reducers.leaveTable({
      tableId: table.id,
      lobbyMemberId: `member_${room.id}_${person.clientId}`,
    });
  const knownTables = new Set([...db.gameTable.iter()].map((row) => row.id));
  await host.db.reducers.createGameTable({
    lobbyId: room.id,
    gameType: 'poker',
    settings: JSON.stringify({ name: 'Uncalled privacy', maxPlayers: 5 }),
  });
  const closed = [...db.gameTable.iter()].find(
    (row) => !knownTables.has(row.id),
  ).id;
  await people[1].db.reducers.joinTable({
    tableId: closed,
    lobbyMemberId: `member_${room.id}_${people[1].clientId}`,
  });
  await people[0].db.reducers.handleGameIntent({
    tableId: closed,
    clientId: people[0].clientId,
    intentPayload: '{"type":"start_game"}',
  });
  await until(
    () => JSON.parse(db.gameTable.id.find(closed).stateJson).phase === 'play',
    'Privacy hand starts',
  );
  for (const { page } of views) {
    await page.evaluate(
      ({ code, id, name }) =>
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, tableId: id, name }),
        ),
      { code: room.code, id: closed, name: host.name },
    );
    await page.goto('http://127.0.0.1:5175/');
    await page.waitForFunction(
      (id) => window.__eightPlayerEngine.currentScene.lastRow?.id === id,
      closed,
    );
  }
  const turn = JSON.parse(db.gameTable.id.find(closed).stateJson).turnSeatIndex;
  await people[turn].db.reducers.handleGameIntent({
    tableId: closed,
    clientId: people[turn].clientId,
    intentPayload: '{"type":"fold"}',
  });
  await Promise.all(
    views.map(async ({ page, mobile }) => {
      await page.waitForFunction(
        () =>
          window.__eightPlayerEngine.currentScene.pokerDriver.state?.phase ===
          'finished',
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.__eightPlayerEngine.currentScene.actors.filter(
              (actor) => actor.name === 'showdown-card',
            ).length,
        ),
        0,
      );
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${out}40-uncalled-${mobile ? 'mobile' : 'desktop'}-private.png`,
      });
    }),
  );

  let topUpError = '';
  try {
    await host.db.reducers.topUpTable({ tableId: closed, amount: 100000 });
  } catch (error) {
    topUpError = error instanceof Error ? error.message : String(error);
  }
  assert.match(topUpError, /buy-in limits/);
  await Promise.all(
    views.map(async ({ page, mobile }) => {
      await page.evaluate(
        (message) => window.__eightPlayerEngine.currentScene.showError(message),
        topUpError,
      );
      const band = await page.evaluate(() => {
        const actor = window.__eightPlayerEngine.currentScene.actors.find(
          (actor) => actor.name === 'table-notice',
        );
        return {
          x: actor.pos.x,
          y: actor.pos.y,
          w: actor.width,
          h: actor.height,
        };
      });
      assert.equal(band.x, 224);
      assert.equal(band.y, 366);
      assert.ok(band.y + band.h < 434);
      await page.screenshot({
        path: `${out}44-${mobile ? 'mobile' : 'desktop'}-reserved-error-band.png`,
      });
    }),
  );

  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'eight-player-redesign-proof.json',
    JSON.stringify(
      {
        players: 8,
        uniqueIdentities: new Set(
          people.map((person) => person.db.identity!.toHexString()),
        ).size,
        game: 'Omaha',
        desktop: '1440x900',
        mobile: '844x390',
        flopAndShowdown: true,
        foldedHandsExcluded: true,
        showdownContenders: 6,
        reviewNavigation: true,
        readableFullNames: true,
        fullscreenIconCentered: true,
        uncalledHandPrivate: true,
        personalBottomBand: true,
        roomWalletHidden: true,
        errorBandClearOfCardsAndNames: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('EIGHT PLAYER CAPTURES COMPLETE');
} finally {
  await browser.close();
  for (const person of people) person.db.disconnect();
}
