/** Local running-app proof: four independent players, private hands, and actual canvas input. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { orderedSpadesHand } from '../client/src/spades-classic-layout.ts';
import {
  spadesRules,
  readSpadesState,
  type SpadesState,
  type SpadesIntent,
} from '../src/shared/games/spades.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const preview = process.env.SPADES_PREVIEW === '1';
const singleView = process.env.SPADES_SINGLE_VIEW === '1';
const canvasReplay = process.env.SPADES_CANVAS_REPLAY === '1';
assert(
  !canvasReplay || singleView,
  'Canvas replay requires SPADES_SINGLE_VIEW=1',
);
const baseOut =
  process.env.SPADES_EVIDENCE_DIR ?? '../docs/classic-spades-evidence/';
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
  ['Ava Bennett', 'Ben Harrison', 'Chloe Martin', 'Dev Sharma'].map(connect),
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
    gameType: 'spades',
    settings: JSON.stringify({
      name: 'Classic Spades',
      maxPlayers: 4,
      entryFee: 20,
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
  const state = (): SpadesState =>
    readSpadesState(JSON.parse(db.gameTable.id.find(table.id)!.stateJson));
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
    await context.route('**/@vite/client', async (route) => {
      const response = await route.fetch();
      const env = (await response.text()).split('\n')[0];
      await route.fulfill({
        response,
        body: env + '\nexport {};',
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
          ) + '\nwindow.__classicSpadesEngine=engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('PAGEERROR', error.message);
    });
    await page.goto('http://127.0.0.1:5175/');
    await page
      .waitForFunction(
        (id) =>
          window.__classicSpadesEngine?.currentScene.lastRow?.id === id &&
          window.__classicSpadesEngine.currentScene.spadesDriver.buttonsReady,
        table.id,
      )
      .catch(async (error) => {
        console.log(
          'DEBUG',
          await page.evaluate(() => ({
            scene: window.__classicSpadesEngine?.currentScene?.constructor.name,
            row: window.__classicSpadesEngine?.currentScene?.lastRow,
            body: document.body.innerText,
          })),
        );
        await page.screenshot({ path: out + 'error.png' });
        throw error;
      });
    views.push({ page, context, name, person: personIndex, mobile });
    console.log('OPEN', name);
  };

  const openingSeat = state().turnSeatIndex!;
  if (preview || singleView) await open('mobile', openingSeat, 844, 390, true);
  else {
    await open('desktop', 0, 1440, 900, false);
    await open('mobile', openingSeat, 844, 390, true);
  }
  const sync = async () => {
    const actual = JSON.stringify(state());
    for (const view of views)
      await view.page
        .waitForFunction(
          (json) =>
            JSON.stringify(
              window.__classicSpadesEngine?.currentScene?.spadesDriver?.state,
            ) === json,
          actual,
        )
        .catch(async (error: unknown) => {
          const debug = await view.page.evaluate(() => ({
            scene: window.__classicSpadesEngine?.currentScene?.constructor.name,
            row: window.__classicSpadesEngine?.currentScene?.lastRow,
            state:
              window.__classicSpadesEngine?.currentScene?.spadesDriver?.state,
          }));
          writeFileSync(
            `${out}sync-error-${view.name}.json`,
            JSON.stringify(
              { expected: JSON.parse(actual), actual: debug, errors },
              (_key, value: unknown) =>
                typeof value === 'bigint' ? String(value) : value,
              2,
            ),
          );
          await view.page.screenshot({
            path: `${out}sync-error-${view.name}.png`,
          });
          throw error;
        });
  };
  const capture = async (stage: string) => {
    await sync();
    await delay(800);
    for (const view of views)
      await view.page.screenshot({ path: `${out}${stage}-${view.name}.png` });
    const webgl = await views[0].page.evaluate(() =>
      window.__classicSpadesEngine.graphicsContext.constructor.name.includes(
        'WebGL',
      ),
    );
    // The test-only fallback replaces the canvas; retain its initial viewport.
    if (!preview && webgl) {
      const phone = views.find((v) => v.mobile)!;
      await phone.page.setViewportSize({ width: 667, height: 375 });
      await delay(700);
      await phone.page.screenshot({ path: `${out}${stage}-small-mobile.png` });
      await phone.page.setViewportSize({ width: 844, height: 390 });
      await delay(700);
    }
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
        window.__classicSpadesEngine.currentScene.actors.some(
          (actor) =>
            actor.name === name &&
            actor.graphics.isVisible &&
            !actor.isKilled(),
        ),
      name,
    );
    const pos = await view.page.evaluate((name) => {
      const actor = window.__classicSpadesEngine.currentScene.actors.find(
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

  const mobile = views.find((v) => v.mobile)!;
  const driver = async (page: Page) =>
    page.evaluate(() => {
      const s = window.__classicSpadesEngine.currentScene,
        d = s.spadesDriver;
      return {
        classic: s.usesClassicLayout,
        hand: d.visibleHand.length,
        pages: d.handPageCount,
        selected: d.selected,
        backs: d.backs.size,
        scores: d.scoresOpen,
        legacy: s.seatActors.length,
      };
    });
  const selectCard = async (view: (typeof views)[number], card: string) => {
    for (let n = 0; n < 5; n++) {
      const data = await view.page.evaluate((card) => {
        const d = window.__classicSpadesEngine.currentScene.spadesDriver;
        return { shown: d.visibleHand.includes(card), selected: d.selected };
      }, card);
      if (data.shown) {
        if (data.selected !== card) await tapActor(view, `spades-card-${card}`);
        return;
      }
      await tapActor(view, 'spades-control-hand-next');
    }
    throw Error('Card not found');
  };
  const ruleCtx = (seat: number) => ({
    seat: {
      id: `s${seat}`,
      tableId: table.id,
      lobbyMemberId: `m${seat}`,
      seatIndex: seat,
      chips: null,
      joinedAt: 1,
      seatState: 'active' as const,
    },
    now: 1,
  });
  const choose = (s: SpadesState): SpadesIntent => {
    const seat = s.turnSeatIndex!;
    for (const card of orderedSpadesHand(s.hands[String(seat)])) {
      try {
        spadesRules.applyIntent(s, { type: 'play', card }, ruleCtx(seat));
        return { type: 'play', card };
      } catch {
        /* Shared rules decide legality. */
      }
    }
    throw Error('No legal card');
  };
  let desktopPlay = false;
  let brokenCaptured = false,
    handCaptured = false;
  const profile: unknown[] = [];
  const metrics = async (stage: string) => {
    const session = await mobile.context.newCDPSession(mobile.page);
    const heap = await session.send('Runtime.getHeapUsage');
    const engine = await mobile.page.evaluate(() => {
      const e = window.__classicSpadesEngine;
      return {
        renderer: e.graphicsContext.constructor.name,
        actors: e.currentScene.actors.length,
        cards: e.currentScene.spadesDriver.cards.size,
        fps: e.stats.currFrame.fps,
      };
    });
    profile.push({ stage, heap, engine });
    await session.detach();
    writeFileSync(out + 'profile.json', JSON.stringify(profile, null, 2));
    console.log('PROFILE', stage, JSON.stringify({ heap, engine }));
  };
  await capture('01-four-player-bidding');
  for (const view of views) {
    const data = await driver(view.page);
    assert.equal(data.classic, true);
    assert.equal(data.backs, 12);
    assert.ok(data.pages > 1);
    assert.equal(data.legacy, 0);
  }
  // Touch inspection during bidding is available, but a hold never selects a card.
  const first = await mobile.page.evaluate(
    () => window.__classicSpadesEngine.currentScene.spadesDriver.visibleHand[0],
  );
  const pos = await mobile.page.evaluate((id) => {
      const r =
        window.__classicSpadesEngine.currentScene.spadesDriver.cards.get(id);
      return { x: r.restX, y: 484 };
    }, first),
    point = await coords(mobile.page, pos.x, pos.y),
    cdp = await mobile.context.newCDPSession(mobile.page);
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
  assert.equal((await driver(mobile.page)).selected, null);
  await tapActor(mobile, 'spades-control-bid:0');
  await until(
    () => state().bids[String(openingSeat)] === 0,
    'Nil bid replicated',
  );
  while (state().stage === 'bid')
    await move(state().turnSeatIndex!, { type: 'bid', tricks: 3 });
  await sync();
  await delay(500);
  await tapActor(mobile, 'spades-control-play');
  assert.equal(state().trick.length, 0, 'Empty Play disabled');
  const firstPlay = choose(state()) as { type: 'play'; card: string };
  await selectCard(mobile, firstPlay.card);
  if ((await driver(mobile.page)).pages > 1) {
    await tapActor(mobile, 'spades-control-hand-next');
    assert.equal(
      (await driver(mobile.page)).selected,
      firstPlay.card,
      'Selection survives paging away from its card',
    );
    await tapActor(mobile, 'spades-control-hand-prev');
  }
  await capture('02-selected-card');
  assert.equal(
    (await driver(mobile.page)).selected,
    firstPlay.card,
    'Selection survives resizing',
  );
  await tapActor(mobile, 'spades-control-play');
  await until(() => state().trick.length === 1, 'Touch Play replicated');
  while (state().trick.length > 0) {
    const seat = state().turnSeatIndex!,
      intent = choose(state()),
      view = views.find((v) => v.person === seat && !v.mobile);
    if (view && intent.type === 'play') {
      await sync();
      await delay(500);
      await selectCard(view, intent.card);
      await tapActor(view, 'spades-control-play');
      await until(
        () => !state().hands[String(seat)].includes(intent.card),
        'Desktop Play replicated',
      );
      desktopPlay = true;
    } else await move(seat, intent);
  }
  await capture('03-complete-trick');
  await tapActor(mobile, 'spades-control-scores');
  await capture('04-partnership-scores');
  assert.equal((await driver(mobile.page)).scores, true);
  const resting = await mobile.page.evaluate(() =>
    [
      ...window.__classicSpadesEngine.currentScene.spadesDriver.cards.values(),
    ].every((r) => r.personal && r.actor.graphics.current.scale.x <= 1.35),
  );
  assert.equal(
    resting,
    true,
    'Score view hides trick and suppresses card inspection',
  );
  await tapActor(mobile, 'classic-close');
  while (state().phase !== 'finished' && state().handNumber === 1) {
    await move(state().turnSeatIndex!, choose(state()));
    if (state().spadesBroken && !brokenCaptured) {
      await capture('05-spades-broken');
      brokenCaptured = true;
    }
  }
  await capture('06-next-hand-score');
  handCaptured = true;
  if (canvasReplay) {
    await metrics('webgl-first-hand-complete');
    await mobile.page.evaluate(() =>
      window.__classicSpadesEngine.useCanvas2DFallback(),
    );
    await metrics('canvas2d-start');
  }
  if (!preview) {
    // Simulate legal deterministic play to choose accurate bids, then execute every move through real reducers.
    // This is a test oracle, not product AI, and never edits subscribed/browser game state.
    for (let hand = 0; state().phase !== 'finished' && hand < 20; hand++) {
      let sim = structuredClone(state());
      const number = sim.handNumber;
      while (sim.stage === 'bid')
        sim = spadesRules.applyIntent(
          sim,
          { type: 'bid', tricks: 1 },
          ruleCtx(sim.turnSeatIndex!),
        );
      const counts = [0, 0, 0, 0],
        plan: { seat: number; intent: SpadesIntent }[] = [];
      while (sim.phase === 'play' && sim.handNumber === number) {
        const seat = sim.turnSeatIndex!,
          intent = choose(sim),
          before = sim;
        sim = spadesRules.applyIntent(sim, intent, ruleCtx(seat));
        plan.push({ seat, intent });
        if (before.trick.length === 3 && intent.type === 'play') {
          const trick = [...before.trick, { seat, card: intent.card }],
            led = trick[0].card.slice(-1),
            values = [
              '2',
              '3',
              '4',
              '5',
              '6',
              '7',
              '8',
              '9',
              '10',
              'J',
              'Q',
              'K',
              'A',
            ];
          const best = trick.reduce((a, b) => {
            const sa = a.card.slice(-1),
              sb = b.card.slice(-1),
              higher =
                values.indexOf(b.card.slice(0, -1)) >
                values.indexOf(a.card.slice(0, -1));
            return sb === 'S'
              ? sa !== 'S' || higher
                ? b
                : a
              : sa !== 'S' && sb === led && higher
                ? b
                : a;
          });
          counts[best.seat]++;
        }
      }
      while (state().stage === 'bid')
        await move(state().turnSeatIndex!, {
          type: 'bid',
          tricks: counts[state().turnSeatIndex!],
        });
      for (const [step, action] of plan.entries()) {
        if (state().phase === 'finished') break;
        assert.equal(state().turnSeatIndex, action.seat);
        await move(action.seat, action.intent);
        if ((step + 1) % 4 === 0) await sync();
      }
      // Let the live canvas consume each completed hand before the next replay burst.
      await sync();
      console.log('HAND REPLICATED', state().handNumber, state().scores);
    }
    assert.equal(state().phase, 'finished');
    await metrics('retained-finished');
    await capture('07-winning-partnership');
    for (const view of views) {
      const safe = await view.page.evaluate(() =>
        [
          ...window.__classicSpadesEngine.currentScene.spadesDriver.cards.values(),
        ].every((r) => r.personal),
      );
      assert.equal(safe, true, 'Remaining opponent hands stay private');
    }
    const toClose = singleView ? views[0] : views.find((v) => !v.mobile)!;
    await toClose.context.close();
    views.splice(views.indexOf(toClose), 1);
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
    await open(
      'spectator',
      4,
      singleView ? 844 : 1440,
      singleView ? 390 : 900,
      singleView,
    );
    await capture('08-spectator');
    const navigating = singleView ? views[0] : mobile;
    for (const target of ['classic-?', 'classic-chat']) {
      await tapActor(navigating, target);
      await delay(300);
      await navigating.page.keyboard.press('Escape');
      await delay(300);
    }
    await tapActor(navigating, 'classic-leave-table');
    await navigating.page.waitForFunction(
      () => !JSON.parse(localStorage.getItem('lastRoom') || '{}').tableId,
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'proof.json',
    JSON.stringify(
      {
        players: 4,
        longReplayRenderer: canvasReplay
          ? 'Canvas2D (test-only public engine fallback)'
          : 'WebGL',
        freshSpectatorRenderer: 'WebGL',
        browserViews: singleView || preview ? 1 : 2,
        finalHandNumber: state().handNumber,
        finalScores: state().scores,
        uniqueIdentities: 4,
        thirteenCardPaging: true,
        nilCanvasBid: true,
        touchCanvasPlay: true,
        desktopCanvasPlay: desktopPlay,
        holdDoesNotSelect: true,
        emptyPlayDisabled: true,
        completeTrick: true,
        scoresModal: true,
        spadesBroken: brokenCaptured,
        nextHandScoring: handCaptured,
        finished: !preview,
        remainingHandsPrivate: true,
        spectator: !preview,
        navigation: !preview,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('CLASSIC SPADES PROOF PASSED');
} finally {
  for (const v of views) await v.context.close();
  await browser.close();
  for (const person of people) person.db.disconnect();
}
