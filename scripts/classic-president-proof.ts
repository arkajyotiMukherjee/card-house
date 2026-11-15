/** Local running-app proof: six independent players, private hands, and actual canvas input. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { orderedPresidentHand } from '../client/src/president-classic-layout.ts';
import {
  PRESIDENT_RANKS,
  presidentRankOf,
  presidentRules,
  type PresidentState,
  type PresidentIntent,
} from '../src/shared/games/president.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const preview = process.env.PRESIDENT_PREVIEW === '1';
const baseOut =
  process.env.PRESIDENT_EVIDENCE_DIR ?? '../docs/classic-president-evidence/';
const out = fileURLToPath(
  new URL(baseOut + (preview ? 'preview/' : ''), import.meta.url),
);
mkdirSync(out, { recursive: true });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string): Promise<void> {
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
      .onConnect((db, _id, credential) => {
        token = credential;
        db.subscriptionBuilder()
          .onApplied(() => resolve(db))
          .onError(reject)
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => reject(error))
      .build(),
  );
  return { db, token, name, clientId: crypto.randomUUID() };
}
const people = await Promise.all(
  [
    'Ava Bennett',
    'Ben Harrison',
    'Chloe Martin',
    'Dev Sharma',
    'Ella Johnson',
    'Finn Walker',
  ].map(connect),
);
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const views: {
  page: Page;
  context: BrowserContext;
  name: string;
  person: number;
  mobile: boolean;
}[] = [];
const errors: string[] = [];
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
    gameType: 'president',
    settings: JSON.stringify({
      name: 'Classic President',
      maxPlayers: 6,
      entryFee: 20,
    }),
  });
  let table = [...db.gameTable.iter()].find((row) => row.lobbyId === room.id)!;
  for (const person of people.slice(1))
    await person.db.reducers.joinTable({
      tableId: table.id,
      lobbyMemberId: `member_${room.id}_${person.clientId}`,
    });
  const state = (): PresidentState =>
    JSON.parse(db.gameTable.id.find(table.id)!.stateJson);
  const move = async (index: number, intent: unknown): Promise<void> => {
    const before = JSON.stringify(state());
    await people[index].db.reducers.handleGameIntent({
      tableId: table.id,
      clientId: people[index].clientId,
      intentPayload: JSON.stringify(intent),
    });
    await until(() => JSON.stringify(state()) !== before, 'Intent replicated');
  };
  await move(0, { type: 'start_game' });
  const open = async (
    name: string,
    personIndex: number,
    width: number,
    height: number,
    mobile: boolean,
  ): Promise<void> => {
    const person = people[personIndex],
      context = await browser.newContext({
        viewport: { width, height },
        isMobile: mobile,
        hasTouch: mobile,
      });
    await context.addInitScript(
      ({ person, code, tableId }) => {
        localStorage.setItem('clientId', person.clientId);
        localStorage.setItem('stdbToken', person.token);
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, name: person.name, tableId }),
        );
      },
      {
        person: {
          clientId: person.clientId,
          token: person.token,
          name: person.name,
        },
        code: room.code,
        tableId: table.id,
      },
    );
    await context.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()).replace(
            /pixelRatio:\s*2/,
            'pixelRatio: 2, maxFps: 30',
          ) + '\nwindow.__classicPresidentEngine=engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5175/');
    await page.waitForFunction(
      (id) =>
        window.__classicPresidentEngine?.currentScene.lastRow?.id === id &&
        window.__classicPresidentEngine.currentScene.presidentDriver
          .buttonsReady,
      table.id,
    );
    views.push({ page, context, name, person: personIndex, mobile });
    console.log('OPEN', name);
  };
  const openingSeat = state().turnSeatIndex!;
  if (preview) await open('mobile', openingSeat, 844, 390, true);
  else {
    await open('desktop', (openingSeat + 1) % 6, 1440, 900, false);
    await open('mobile', openingSeat, 844, 390, true);
    await open('small-mobile', openingSeat, 667, 375, true);
  }
  const sync = async (): Promise<void> => {
    const actual = JSON.stringify(state());
    for (const view of views)
      await view.page.waitForFunction(
        (actual) =>
          JSON.stringify(
            window.__classicPresidentEngine?.currentScene?.presidentDriver
              ?.state,
          ) === actual,
        actual,
      );
  };
  const capture = async (stage: string): Promise<void> => {
    await sync();
    await delay(850);
    for (const view of views)
      await view.page.screenshot({ path: `${out}${stage}-${view.name}.png` });
    console.log('CAPTURED', stage);
  };
  const coords = async (page: Page, x: number, y: number) => {
    const box = (await page.locator('canvas').boundingBox())!,
      scale = box.height / 540,
      gutter = (box.width / scale - 960) / 2;
    return { x: box.x + (x + gutter) * scale, y: box.y + y * scale };
  };
  const tapActor = async (
    view: (typeof views)[number],
    name: string,
  ): Promise<void> => {
    await view.page.waitForFunction(
      (name) =>
        window.__classicPresidentEngine.currentScene.actors.some(
          (actor) =>
            actor.name === name &&
            actor.graphics.isVisible &&
            !actor.isKilled(),
        ),
      name,
    );
    const pos = await view.page.evaluate((name) => {
      const actor = window.__classicPresidentEngine.currentScene.actors.find(
        (actor) =>
          actor.name === name && actor.graphics.isVisible && !actor.isKilled(),
      );
      return {
        x: actor.pos.x + (actor.anchor.x === 0 ? actor.width / 2 : 0),
        y: actor.pos.y + (actor.anchor.y === 0 ? actor.height / 2 : 0),
      };
    }, name);
    const p = await coords(view.page, pos.x, pos.y);
    if (view.mobile) await view.page.touchscreen.tap(p.x, p.y);
    else await view.page.mouse.click(p.x, p.y);
    await delay(180);
  };
  const actingView = views.find((view) => view.name === 'mobile')!;
  const hostView = actingView;
  await capture('01-six-player-opening');
  for (const view of views) {
    const data = await view.page.evaluate(() => {
      const scene = window.__classicPresidentEngine.currentScene,
        driver = scene.presidentDriver;
      return {
        classic: scene.usesClassicLayout,
        names: scene.actors.filter(
          (a) => a.name === 'president-player-name' && !a.isKilled(),
        ).length,
        backs: driver.backs.size,
        pages: driver.handPageCount,
        legacyNames: scene.seatActors.length,
        pass: driver.passControl.actor.graphics.isVisible,
      };
    });
    assert.deepEqual(data, {
      classic: true,
      names: 6,
      backs: 20,
      pages: 1,
      legacyNames: 0,
      pass: false,
    });
  }
  await tapActor(hostView, 'president-control-play');
  assert.equal(state().playPile.length, 0, 'Empty Play is disabled');
  const position = await hostView.page.evaluate(() => {
    const row =
      window.__classicPresidentEngine.currentScene.presidentDriver.cards.get(
        '3C',
      );
    return { x: row.restX, y: 484 };
  });
  const point = await coords(hostView.page, position.x, position.y),
    cdp = await hostView.context.newCDPSession(hostView.page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await delay(500);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await delay(200);
  assert.equal(
    await hostView.page.evaluate(
      () =>
        window.__classicPresidentEngine.currentScene.presidentDriver.selected
          .size,
    ),
    0,
    'Hold inspects without selecting',
  );
  await tapActor(hostView, 'president-card-3C');
  assert.equal(
    await hostView.page.evaluate(
      () =>
        window.__classicPresidentEngine.currentScene.presidentDriver.selected
          .size,
    ),
    1,
  );
  await tapActor(hostView, 'president-control-play');
  await until(() => state().playPile.length === 1, 'Opening card played');
  await capture('02-current-combination');
  const resized = views.find((v) => v.name === 'desktop') ?? hostView,
    oldSize = resized.page.viewportSize()!;
  await resized.page.setViewportSize({ width: 1200, height: 600 });
  await delay(800);
  const alignment = await resized.page.evaluate(() => {
    const scene = window.__classicPresidentEngine.currentScene,
      driver = scene.presidentDriver;
    return scene.placed
      .filter((seat) => !seat.self)
      .map((seat) => {
        const label = scene.actors.find(
          (a) =>
            a.name === 'president-player-name' &&
            !a.isKilled() &&
            a.graphics.current?.text === seat.name,
        );
        const backs = [...driver.backs]
          .filter(([key]) => key.startsWith(`${seat.seatIndex}:`))
          .map(([, a]) => a.pos.x);
        return Math.abs(
          backs.reduce((sum, x) => sum + x, 0) / backs.length -
            label.pos.x -
            label.width / 2,
        );
      });
  });
  assert.ok(
    alignment.every((v) => v < 0.1),
    'Backs stay centered over names after resize',
  );
  await resized.page.setViewportSize(oldSize);
  await delay(500);
  // Actual accepted passes clear the trick and return the lead to the 3C holder.
  let passes = 0;
  if (!preview) {
    await tapActor(
      views.find((v) => v.name === 'desktop')!,
      'president-control-pass',
    );
    await until(
      () => state().passes === 1,
      'Second player passed from desktop UI',
    );
    passes++;
  }
  while (state().currentRank !== null) {
    await move(state().turnSeatIndex!, { type: 'pass' });
    passes++;
  }
  assert.equal(passes, 5);
  assert.equal(state().turnSeatIndex, openingSeat);
  await capture('03-new-lead');
  const choose = (s: PresidentState): PresidentIntent => {
    const seat = s.turnSeatIndex!,
      hand = orderedPresidentHand(s.hands[String(seat)]);
    const groups = PRESIDENT_RANKS.map((rank) =>
      hand.filter((card) => presidentRankOf(card) === rank),
    );
    const candidates =
      s.currentRank === null
        ? groups.filter((g) => g.length).sort((a, b) => b.length - a.length)
        : groups
            .filter(
              (g) =>
                g.length >= s.currentCount &&
                PRESIDENT_RANKS.indexOf(presidentRankOf(g[0])!) >
                  PRESIDENT_RANKS.indexOf(s.currentRank!),
            )
            .map((g) => g.slice(0, s.currentCount));
    for (const cards of candidates) {
      const intent = { type: 'play', cards } as const;
      try {
        presidentRules.applyIntent(s, intent, {
          seat: {
            id: 'proof',
            tableId: table.id,
            lobbyMemberId: 'proof',
            seatIndex: seat,
            chips: null,
            joinedAt: 1,
            seatState: 'active',
          },
          now: 1,
        });
        return intent;
      } catch {
        /* Rules, rather than UI guesses, decide candidate legality. */
      }
    }
    return { type: 'pass' };
  };
  let pairCaptured = false,
    tripleCaptured = false,
    finishedCaptured = false;
  const limit = preview ? 30 : 500;
  for (let n = 0; state().phase !== 'finished' && n < limit; n++) {
    await move(state().turnSeatIndex!, choose(state()));
    if (!pairCaptured && state().currentCount === 2) {
      await capture('04-pair-to-beat');
      pairCaptured = true;
    }
    if (!tripleCaptured && state().currentCount >= 3) {
      await capture('04-larger-combination');
      tripleCaptured = true;
    }
    if (
      !finishedCaptured &&
      state().finishOrder.length > 0 &&
      state().phase !== 'finished'
    ) {
      await capture('05-first-player-out');
      finishedCaptured = true;
    }
  }
  if (!preview) {
    assert.equal(state().phase, 'finished');
    assert.equal(state().rankOrder.length, 6);
    await capture('06-finish-order');
    for (const view of views) {
      const result = await view.page.evaluate(() => {
        const scene = window.__classicPresidentEngine.currentScene,
          driver = scene.presidentDriver;
        return {
          public: [...driver.cards.values()].filter((r) => !r.personal).length,
          play: driver.playControl.actor.graphics.isVisible,
          pass: driver.passControl.actor.graphics.isVisible,
          order: scene.actors
            .filter((a) => a.name === 'president-finish-name' && !a.isKilled())
            .map((a) => a.graphics.current.text),
          winner: scene.actors.find(
            (a) => a.name === 'president-result' && !a.isKilled(),
          ).graphics.current.text,
        };
      });
      assert.equal(
        result.public,
        0,
        'No private opponent cards revealed at finish',
      );
      assert.equal(result.play, false);
      assert.equal(result.pass, false);
      assert.equal(result.order.length, 6);
      assert.equal(result.winner, people[state().winnerSeatIndex!].name);
    }
    const desktop = views.find((v) => v.name === 'desktop')!;
    await desktop.context.close();
    views.splice(views.indexOf(desktop), 1);
    const watcher = await connect('Iris Taylor');
    people.push(watcher);
    await watcher.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: watcher.clientId,
      name: watcher.name,
    });
    await watcher.db.reducers.spectateTable({
      tableId: table.id,
      lobbyMemberId: `member_${room.id}_${watcher.clientId}`,
    });
    await open('spectator', 6, 1440, 900, false);
    await capture('07-six-player-spectator');
    const watcherView = views.find((v) => v.person === 6)!;
    assert.equal(
      await watcherView.page.evaluate(
        () =>
          window.__classicPresidentEngine.currentScene.presidentDriver
            .visibleHand.length,
      ),
      0,
    );
    await watcherView.context.close();
    views.splice(views.indexOf(watcherView), 1);
    for (const target of ['classic-?', 'classic-chat']) {
      await tapActor(hostView, target);
      await hostView.page.waitForFunction((help) => {
        const s = window.__classicPresidentEngine.currentScene;
        return help ? s.howToPlay.isOpen : s.tableChat.isOpen;
      }, target === 'classic-?');
      await hostView.page.keyboard.press('Escape');
      await delay(250);
    }
    await tapActor(hostView, 'classic-leave-table');
    await hostView.page.waitForFunction(
      () => !JSON.parse(localStorage.getItem('lastRoom') || '{}').tableId,
    );
    for (const v of views) await v.context.close();
    views.length = 0;
    // A separate real minimum-size table exercises the largest dealt hand (18 cards).
    for (const person of people.slice(0, 3))
      await person.db.reducers
        .leaveTable({
          tableId: table.id,
          lobbyMemberId: `member_${room.id}_${person.clientId}`,
        })
        .catch(() => {});
    await host.db.reducers.createGameTable({
      lobbyId: room.id,
      gameType: 'president',
      settings: JSON.stringify({
        name: 'President · long hand',
        maxPlayers: 3,
        entryFee: 20,
      }),
    });
    const dense = [...db.gameTable.iter()].filter(
      (row) => row.lobbyId === room.id && row.id !== table.id,
    )[0]!;
    for (const person of people.slice(1, 3))
      await person.db.reducers.joinTable({
        tableId: dense.id,
        lobbyMemberId: `member_${room.id}_${person.clientId}`,
      });
    await host.db.reducers.handleGameIntent({
      tableId: dense.id,
      clientId: host.clientId,
      intentPayload: JSON.stringify({ type: 'start_game' }),
    });
    const denseState = (): PresidentState =>
      JSON.parse(db.gameTable.id.find(dense.id)!.stateJson);
    const oldTable = table.id;
    table = dense;
    const denseOpening = denseState().turnSeatIndex!;
    await open('desktop', denseOpening, 1440, 900, false);
    await open('mobile', denseOpening, 844, 390, true);
    await open('small-mobile', denseOpening, 667, 375, true);
    await capture('08-large-hand');
    for (const v of views) {
      assert.ok(
        (await v.page.evaluate(
          () =>
            window.__classicPresidentEngine.currentScene.presidentDriver
              .handPageCount,
        )) > 1,
      );
    }
    const denseView = views.find((v) => v.name === 'mobile')!;
    const first = await denseView.page.evaluate(
      () =>
        window.__classicPresidentEngine.currentScene.presidentDriver
          .visibleHand[0],
    );
    await tapActor(denseView, `president-card-${first}`);
    await tapActor(denseView, 'president-control-hand-next');
    const second = await denseView.page.evaluate(
      () =>
        window.__classicPresidentEngine.currentScene.presidentDriver
          .visibleHand[0],
    );
    await tapActor(denseView, `president-card-${second}`);
    assert.equal(
      await denseView.page.evaluate(
        () =>
          window.__classicPresidentEngine.currentScene.presidentDriver.selected
            .size,
      ),
      2,
      'Selection survives paging',
    );
    await capture('09-cross-page-selection');
    // Selection survives a resize even if the page capacity changes.
    await denseView.page.setViewportSize({ width: 667, height: 375 });
    await delay(800);
    assert.equal(
      await denseView.page.evaluate(
        () =>
          window.__classicPresidentEngine.currentScene.presidentDriver.selected
            .size,
      ),
      2,
    );
    await denseView.page.setViewportSize({ width: 844, height: 390 });
    await delay(800);
    assert.notEqual(oldTable, table.id);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'proof.json',
    JSON.stringify(
      {
        players: 6,
        uniqueIdentities: 6,
        desktopAndTwoTouchSizes: !preview,
        openingUiPlay: true,
        emptyPlayDisabled: true,
        holdDoesNotSelect: true,
        opponentResizeAlignment: true,
        allPassesClearTrick: true,
        pairCaptured,
        tripleCaptured,
        finishOrder: !preview,
        remainingHandsPrivate: !preview,
        largeHandsPaged: !preview,
        selectionRetainedAcrossPagesAndResize: !preview,
        headerChatHelpLeave: !preview,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('CLASSIC PRESIDENT PROOF PASSED');
} finally {
  for (const view of views) await view.context.close();
  await browser.close();
  for (const person of people) person.db.disconnect();
}
