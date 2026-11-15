/** Real local two-player Bluff table: mouse/touch focus, selection and paging. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = fileURLToPath(
  new URL('../docs/hand-layering-evidence/', import.meta.url),
);
mkdirSync(out, { recursive: true });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect(name: string) {
  let token = '';
  const db = await new Promise<DbConnection>((resolve, reject) =>
    DbConnection.builder()
      .withUri('http://127.0.0.1:3000')
      .withDatabaseName('room-economy-test')
      .onConnect((db, _id, value) => {
        token = value;
        db.subscriptionBuilder()
          .onApplied(() => resolve(db))
          .onError(reject)
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => reject(error))
      .build(),
  );
  return { db, token, clientId: crypto.randomUUID(), name };
}
const people = await Promise.all([
  connect('Layer Host'),
  connect('Layer Guest'),
]);
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const errors: string[] = [];
const samples: unknown[] = [];
let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
try {
  const host = people[0],
    db = host.db.db;
  await host.db.reducers.createLobby({ startingCoins: 10000 });
  const room = [...db.lobby.iter()].find(
    (row) => row.creatorIdentity === host.db.identity!.toHexString(),
  )!;
  for (const person of people)
    await person.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: person.clientId,
      name: person.name,
    });
  await host.db.reducers.createGameTable({
    lobbyId: room.id,
    gameType: 'bluff',
    settings: JSON.stringify({ name: 'Bluff', maxPlayers: 2, entryFee: 20 }),
  });
  const table = [...db.gameTable.iter()].find(
    (row) => row.lobbyId === room.id,
  )!;
  await people[1].db.reducers.joinTable({
    tableId: table.id,
    lobbyMemberId: `member_${room.id}_${people[1].clientId}`,
  });
  await host.db.reducers.handleGameIntent({
    tableId: table.id,
    clientId: host.clientId,
    intentPayload: JSON.stringify({ type: 'start_game' }),
  });
  const original = db.gameTable.id.find(table.id)!.stateJson;
  const state = JSON.parse(original);
  const owner = people[state.turnSeatIndex];
  assert.equal(state.hands[String(state.turnSeatIndex)].length, 27);
  const open = async (mobile: boolean): Promise<Page> => {
    await context?.close();
    context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      ({ clientId, token, name, code, tableId }) => {
        localStorage.setItem('clientId', clientId);
        localStorage.setItem('stdbToken', token);
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, name, tableId }),
        );
      },
      {
        clientId: owner.clientId,
        token: owner.token,
        name: owner.name,
        code: room.code,
        tableId: table.id,
      },
    );
    await context.route('**/@vite/client', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).split('\n')[0] + '\nexport {};',
        contentType: 'application/javascript',
      });
    });
    await context.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()).replace(
            /pixelRatio:\s*2/,
            'pixelRatio: 2, maxFps: 30',
          ) + '\nwindow.__handLayerEngine=engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5175/');
    await page.waitForFunction(
      (id) =>
        window.__handLayerEngine?.currentScene?.lastRow?.id === id &&
        window.__handLayerEngine.currentScene.bluffDriver?.visibleHand?.length >
          3,
      table.id,
    );
    await delay(700);
    await page.evaluate(() => {
      window.__layerEvents = [];
      const d = window.__handLayerEngine.currentScene.bluffDriver;
      for (const [id, r] of d.cards)
        if (r.personal)
          for (const type of ['pointerenter', 'pointerleave', 'pointermove'])
            r.actor.on(type, (e) =>
              window.__layerEvents.push({
                id,
                type,
                x: e.worldPos.x,
                y: e.worldPos.y,
              }),
            );
    });
    return page;
  };
  const snapshot = (page: Page) =>
    page.evaluate(() => {
      const d = window.__handLayerEngine.currentScene.bluffDriver;
      return {
        selected: [...d.selected],
        page: d.handPage,
        pages: d.handPageCount,
        cards: d.visibleHand.map((id: string) => {
          const r = d.cards.get(id);
          return {
            id,
            x: r.actor.pos.x,
            y: r.actor.pos.y,
            z: r.actor.z,
            restZ: r.restZ,
            scale: r.actor.graphics.current.scale.x,
            focused: d.handHover.isFocused(id),
          };
        }),
      };
    });
  const point = async (page: Page, id: string) => {
    const data = await snapshot(page),
      card = data.cards.find((c: { id: string }) => c.id === id)!;
    const box = (await page.locator('canvas').boundingBox())!,
      scale = box.height / 540;
    return {
      x: box.x + (card.x + (box.width / scale - 960) / 2) * scale,
      y: box.y + card.y * scale,
    };
  };
  const assertFocus = async (page: Page, id: string, count: number) => {
    const s = await snapshot(page),
      focus = s.cards.find((c: { id: string }) => c.id === id)!;
    assert.equal(focus.focused, true);
    assert.ok(
      s.cards
        .filter((c: { id: string }) => c.id !== id)
        .every((c: { z: number }) => focus.z > c.z),
      'Focused card is above every selected/hovering neighbour',
    );
    assert.equal(s.selected.length, count);
    samples.push(s);
  };
  const assertRest = async (page: Page, count: number, mobile: boolean) => {
    await page
      .waitForFunction(
        (mobile) => {
          const d = window.__handLayerEngine.currentScene.bluffDriver;
          return d.visibleHand.every((id: string) => {
            const r = d.cards.get(id);
            return (
              !d.handHover.isFocused(id) &&
              r.actor.z === r.restZ &&
              Math.abs(
                r.actor.graphics.current.scale.x - (mobile ? 1.35 : 1.1),
              ) < 0.001
            );
          });
        },
        mobile,
        { timeout: 10000 },
      )
      .catch(async (error) => {
        const data = await snapshot(page);
        console.log('REST_DIAGNOSTIC', JSON.stringify(data));
        console.log(
          'POINTER_DIAGNOSTIC',
          JSON.stringify(
            await page.evaluate(() => {
              const engine = window.__handLayerEngine,
                d = engine.currentScene.bluffDriver;
              return {
                point: engine.input.pointers.primary.lastWorldPos,
                pointerX: d.handHover.pointerX,

                events: window.__layerEvents,
              };
            }),
          ),
        );
        await page.screenshot({ path: out + 'rest-diagnostic.png' });
        throw error;
      });
    const s = await snapshot(page);
    assert.equal(s.selected.length, count);
    assert.ok(
      s.cards.every(
        (c: { focused: boolean; z: number; restZ: number; scale: number }) =>
          !c.focused &&
          c.z === c.restZ &&
          Math.abs(c.scale - (mobile ? 1.35 : 1.1)) < 0.001,
      ),
    );
    assert.ok(
      s.cards
        .slice(1)
        .every((c: { z: number }, i: number) => c.z > s.cards[i].z),
      'Right-hand cards keep the left corners visible',
    );
    samples.push(s);
  };

  let page = await open(false);
  let initial = await snapshot(page),
    left = initial.cards[3].id,
    right = initial.cards[4].id;
  let p = await point(page, left);
  await page.mouse.click(p.x, p.y);
  await delay(120);
  p = await point(page, right);
  await page.mouse.move(p.x, p.y);
  await delay(300);
  await assertFocus(page, right, 1);
  await page.screenshot({
    path: out + '01-desktop-selected-left-hover-right.png',
  });
  await page.mouse.click(p.x, p.y);
  await delay(120);
  const away = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(away.x + away.width / 2, away.y + 60, { steps: 6 });
  await assertRest(page, 2, false);
  await page.screenshot({ path: out + '02-desktop-selected-pair-rest.png' });
  p = await point(page, left);
  await page.mouse.move(p.x, p.y);
  await delay(200);
  await assertFocus(page, left, 2);
  await page.screenshot({
    path: out + '03-desktop-hover-left-of-selected.png',
  });

  page = await open(true);
  initial = await snapshot(page);
  left = initial.cards[3].id;
  right = initial.cards[4].id;
  p = await point(page, left);
  await page.touchscreen.tap(p.x, p.y);
  await delay(450);
  const cdp = await page.context().newCDPSession(page);
  p = await point(page, right);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [p],
  });
  await delay(450);
  await assertFocus(page, right, 1);
  await page.screenshot({
    path: out + '04-phone-selected-left-hold-right.png',
  });
  p = await point(page, left);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [p],
  });
  await delay(200);
  await assertFocus(page, left, 1);
  await page.screenshot({ path: out + '05-phone-scrub-left.png' });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await assertRest(page, 1, true);
  p = await point(page, right);
  await page.touchscreen.tap(p.x, p.y);
  await assertRest(page, 2, true);
  await page.screenshot({ path: out + '06-phone-selected-pair-rest.png' });
  await page.setViewportSize({ width: 667, height: 375 });
  await assertRest(page, 2, true);
  await page.screenshot({
    path: out + '07-small-phone-selected-pair-rest.png',
  });
  const beforePage = await snapshot(page);
  const next = await page.evaluate(() => {
    const a =
      window.__handLayerEngine.currentScene.bluffDriver.nextHandControl.actor;
    return { x: a.pos.x + a.width / 2, y: a.pos.y + a.height / 2 };
  });
  const box = (await page.locator('canvas').boundingBox())!,
    scale = box.height / 540;
  await page.touchscreen.tap(
    box.x + (next.x + (box.width / scale - 960) / 2) * scale,
    box.y + next.y * scale,
  );
  await delay(450);
  const afterPage = await snapshot(page);
  assert.notEqual(afterPage.page, beforePage.page);
  assert.equal(afterPage.selected.length, 2);
  assert.ok(afterPage.cards.every((c: { focused: boolean }) => !c.focused));
  assert.equal(
    db.gameTable.id.find(table.id)!.stateJson,
    original,
    'Inspection/selection never submits a game action',
  );
  assert.equal(
    people[1].db.db.gameTable.id.find(table.id)!.stateJson,
    original,
    'Independent identity remains synchronized',
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'proof.json',
    JSON.stringify(
      {
        game: 'bluff',
        independentPlayers: 2,
        privateCards: 27,
        desktop: '1440x900',
        touch: ['844x390', '667x375'],
        hoveredCardAlwaysInFront: true,
        selectedOrderKeepsLeftCorners: true,
        selectedRestSize: true,
        scrubDoesNotSelect: true,
        releaseClearsFocus: true,
        resizeAndPagingPreserveSelection: true,
        unchangedAuthoritativeState: true,
        samples,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('HAND LAYERING PROOF PASSED');
} finally {
  await context?.close();
  await browser.close();
  for (const person of people) person.db.disconnect();
}
