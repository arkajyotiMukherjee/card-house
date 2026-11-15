/** Local running-app proof: six independent players, private hands, and actual canvas input. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import {
  CRAZY_EIGHTS_SUITS,
  cardIsPlayable,
  seatMustPass,
  crazyEightsRules,
  type CrazyEightsIntent,
  rankOfCard,
  readCrazyEightsState,
  type CrazyEightsState,
} from '../src/shared/games/crazy-eights.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const preview = process.env.CRAZY_EIGHTS_PREVIEW === '1';
const baseOut =
  process.env.CRAZY_EIGHTS_EVIDENCE_DIR ??
  '../docs/classic-crazy-eights-evidence/';
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
    'Alexandra Montgomery',
    'Gia Williams',
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
    gameType: 'crazy_eights',
    settings: JSON.stringify({
      name: 'Classic Crazy Eights',
      maxPlayers: 7,
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
  const state = (): CrazyEightsState =>
    readCrazyEightsState(JSON.parse(db.gameTable.id.find(table.id)!.stateJson));
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
          ) + '\nwindow.__classicCrazyEightsEngine=engine;\n',
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
          window.__classicCrazyEightsEngine?.currentScene.lastRow?.id === id &&
          window.__classicCrazyEightsEngine.currentScene.crazyEightsDriver
            .buttonsReady,
        table.id,
      )
      .catch(async (error) => {
        console.log(
          'DEBUG',
          await page.evaluate(() => ({
            scene:
              window.__classicCrazyEightsEngine?.currentScene?.constructor.name,
            row: window.__classicCrazyEightsEngine?.currentScene?.lastRow,
            body: document.body.innerText,
          })),
        );
        await page.screenshot({ path: out + 'error.png' });
        throw error;
      });
    views.push({ page, context, name, person: personIndex, mobile });
    console.log('OPEN', name);
  };

  const actions = (s: CrazyEightsState): CrazyEightsIntent[] => {
    const hand = s.hands[String(s.turnSeatIndex)] ?? [],
      cards = hand.filter((card) => cardIsPlayable(s, card));
    return cards.length
      ? cards.flatMap((card) =>
          rankOfCard(card) === '8'
            ? CRAZY_EIGHTS_SUITS.map((suit) => ({
                type: 'play' as const,
                card,
                suit,
              }))
            : [{ type: 'play' as const, card }],
        )
      : [{ type: seatMustPass(s, s.turnSeatIndex!) ? 'pass' : 'draw' }];
  };
  const simulate = (
    s: CrazyEightsState,
    intent: CrazyEightsIntent,
  ): CrazyEightsState =>
    crazyEightsRules.applyIntent(s, intent, {
      seat: {
        id: 'proof',
        tableId: table.id,
        lobbyMemberId: 'proof',
        seatIndex: s.turnSeatIndex!,
        chips: null,
        joinedAt: 1,
        seatState: 'active',
      },
      now: 1,
    });
  let plan: CrazyEightsIntent[] = [],
    best = -1,
    plannedLargest = 0;
  for (let trial = 1; trial <= 160; trial++) {
    let simulated = state(),
      seed = trial * 7919,
      largest = 0,
      wild = false,
      passed = false;
    const path: CrazyEightsIntent[] = [];
    for (let step = 0; step < 550 && simulated.phase === 'play'; step++) {
      const candidates = actions(simulated);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const intent = candidates[seed % candidates.length];
      path.push(intent);
      if (intent.type === 'play' && rankOfCard(intent.card) === '8')
        wild = true;
      if (intent.type === 'pass') passed = true;
      simulated = simulate(simulated, intent);
      largest = Math.max(
        largest,
        ...Object.values(simulated.hands).map((h) => h.length),
      );
    }
    const score =
      (largest >= 13 ? 100000 : largest * 1000) +
      (passed ? 10000 : 0) +
      (simulated.phase === 'finished' ? 1000 : 0) +
      (wild ? 100 : 0) -
      path.length;
    if (score > best) {
      best = score;
      plan = path;
      plannedLargest = largest;
    }
    if (largest >= 13 && wild && passed && simulated.phase === 'finished')
      break;
  }
  console.log('PLAN', plan.length, 'largest', plannedLargest);
  const opening = state().turnSeatIndex!;
  if (!preview) await open('desktop', 1, 1440, 900, false);
  await open('mobile', opening, 844, 390, true);
  const sync = async () => {
    const actual = JSON.stringify(state());
    for (const view of views)
      await view.page.waitForFunction(
        (value) =>
          JSON.stringify(
            window.__classicCrazyEightsEngine?.currentScene?.crazyEightsDriver
              ?.state,
          ) === value,
        actual,
      );
  };
  const capture = async (stage: string) => {
    await sync();
    await delay(850);
    for (const view of views)
      await view.page.screenshot({ path: `${out}${stage}-${view.name}.png` });
    if (!preview) {
      const phone = views.find((v) => v.name === 'mobile')!;
      await phone.page.setViewportSize({ width: 667, height: 375 });
      await delay(650);
      await phone.page.screenshot({ path: `${out}${stage}-small-mobile.png` });
      await phone.page.setViewportSize({ width: 844, height: 390 });
      await delay(650);
    }
    console.log('CAPTURED', stage);
  };
  const tapActor = async (view: (typeof views)[number], name: string) => {
    const point = await view.page.evaluate((name) => {
      const a = window.__classicCrazyEightsEngine.currentScene.actors.find(
        (a) => a.name === name && !a.isKilled() && a.graphics.isVisible,
      );
      if (!a) throw Error(name + ' not visible');
      return {
        x: a.pos.x + (a.anchor.x === 0 ? a.width / 2 : 0),
        y: a.pos.y + (a.anchor.y === 0 ? a.height / 2 : 0),
      };
    }, name);
    const box = (await view.page.locator('canvas').boundingBox())!,
      scale = box.height / 540,
      gutter = (box.width / scale - 960) / 2;
    const x = box.x + (point.x + gutter) * scale,
      y = box.y + point.y * scale;
    if (view.mobile) await view.page.touchscreen.tap(x, y);
    else await view.page.mouse.click(x, y);
    await delay(200);
  };
  const changePhone = async (person: number) => {
    const old = views.find((v) => v.name === 'mobile')!;
    if (old.person === person) return old;
    await old.context.close();
    views.splice(views.indexOf(old), 1);
    await open('mobile', person, 844, 390, true);
    return views.find((v) => v.name === 'mobile')!;
  };
  const selectCard = async (view: (typeof views)[number], card: string) => {
    for (let n = 0; n < 10; n++) {
      const data = await view.page.evaluate((card) => {
        const d =
          window.__classicCrazyEightsEngine.currentScene.crazyEightsDriver;
        return {
          shown: d.visibleHand.includes(card),
          selected: d.selected.has(card),
        };
      }, card);
      if (data.shown) {
        if (!data.selected) await tapActor(view, `crazy-eights-card-${card}`);
        return;
      }
      await tapActor(view, 'crazy-eights-control-hand-next');
    }
    throw Error('Card page not found');
  };
  await capture('01-seven-player-opening');
  const openingInfo = await views
    .find((v) => v.name === 'mobile')!
    .page.evaluate(() => {
      const s = window.__classicCrazyEightsEngine.currentScene;
      return {
        classic: s.usesClassicLayout,
        backs: s.crazyEightsDriver.backs.size,
        legacy: s.seatActors.length,
      };
    });
  assert.deepEqual(openingInfo, { classic: true, backs: 24, legacy: 0 });
  let wild = false,
    dense = false,
    draw = false,
    pass = false,
    largest = 0,
    secondUi = false;
  for (let n = 0; state().phase === 'play' && n < 800; n++) {
    const s = state(),
      seat = s.turnSeatIndex!,
      intent = plan[n] ?? actions(s)[0];
    largest = Math.max(largest, ...Object.values(s.hands).map((h) => h.length));
    const denseSeat = Object.keys(s.hands)
      .map(Number)
      .find((i) => s.hands[String(i)].length >= 13);
    if (!dense && denseSeat !== undefined) {
      const view = await changePhone(denseSeat);
      await capture('04-large-private-hand');
      const pages = await view.page.evaluate(
        () =>
          window.__classicCrazyEightsEngine.currentScene.crazyEightsDriver
            .handPageCount,
      );
      assert.ok(pages > 1, 'Large phone hand pages');
      await tapActor(view, 'crazy-eights-control-hand-next');
      await capture('05-private-hand-next-page');
      dense = true;
    }
    if (!wild && intent.type === 'play' && rankOfCard(intent.card) === '8') {
      const view = await changePhone(seat);
      await sync();
      await selectCard(view, intent.card);
      await tapActor(view, `crazy-eights-card-${intent.card}`);
      const holdAt = await view.page.evaluate((card) => {
        const a =
          window.__classicCrazyEightsEngine.currentScene.crazyEightsDriver.cards.get(
            card,
          ).actor;
        return { x: a.pos.x, y: a.pos.y };
      }, intent.card);
      const canvas = (await view.page.locator('canvas').boundingBox())!,
        scale = canvas.height / 540,
        gutter = (canvas.width / scale - 960) / 2,
        cdp = await view.context.newCDPSession(view.page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          {
            x: canvas.x + (holdAt.x + gutter) * scale,
            y: canvas.y + holdAt.y * scale,
          },
        ],
      });
      await delay(550);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await delay(200);
      assert.equal(
        await view.page.evaluate(
          () =>
            window.__classicCrazyEightsEngine.currentScene.crazyEightsDriver
              .selected.size,
        ),
        0,
        'Hold inspects without selecting',
      );
      await selectCard(view, intent.card);
      await capture('02-wild-eight-suit-picker');
      const picker = await view.page.evaluate(() => {
        const d =
          window.__classicCrazyEightsEngine.currentScene.crazyEightsDriver;
        return {
          choices: [...d.suitControls.values()].filter(
            (r) => r.actor.graphics.isVisible,
          ).length,
          selected: [...d.cards]
            .filter(([id, r]) => r.personal && d.selected.has(id))
            .map(([, r]) => ({
              scale: r.actor.graphics.current.scale.x,
              top:
                r.actor.pos.y +
                r.actor.graphics.offset.y * r.actor.graphics.current.scale.y -
                28 * r.actor.graphics.current.scale.y,
            })),
        };
      });
      assert.equal(picker.choices, 4);
      assert.equal(picker.selected.length, 1);
      assert.ok(picker.selected.every((r) => r.scale <= 1.35 && r.top >= 428));
      await tapActor(view, `crazy-eights-control-suit:${intent.suit}`);
      await tapActor(view, 'crazy-eights-control-play');
      await until(
        () => state().discardPile.at(-1) === intent.card,
        'Wild eight canvas play',
      );
      assert.equal(state().currentSuit, intent.suit);
      await capture('03-declared-suit');
      wild = true;
    } else if (!draw && intent.type === 'draw') {
      const view = await changePhone(seat);
      await sync();
      const before = s.hands[String(seat)].length;
      await tapActor(view, 'crazy-eights-control-draw');
      await until(
        () => state().hands[String(seat)].length === before + 1,
        'Canvas draw',
      );
      await capture('06-drawn-card');
      draw = true;
    } else if (!pass && intent.type === 'pass') {
      const view = await changePhone(seat);
      await sync();
      await capture('06-no-stock-pass');
      await tapActor(view, 'crazy-eights-control-draw');
      await until(
        () => state().turnSeatIndex !== seat || state().phase === 'finished',
        'Canvas Pass',
      );
      pass = true;
    } else if (
      !preview &&
      !secondUi &&
      seat === 1 &&
      intent.type === 'play' &&
      rankOfCard(intent.card) !== '8'
    ) {
      const view = views.find((v) => v.name === 'desktop')!;
      await sync();
      await selectCard(view, intent.card);
      await tapActor(view, 'crazy-eights-control-play');
      await until(
        () => state().discardPile.at(-1) === intent.card,
        'Independent player canvas play',
      );
      secondUi = true;
    } else {
      await move(seat, intent);
      if (intent.type === 'pass') pass = true;
    }
  }
  assert.equal(state().phase, 'finished');
  assert.equal(wild, true);
  assert.equal(draw, true);
  assert.equal(dense, true);
  if (!preview)
    assert.equal(secondUi, true, 'Second independent player used canvas input');
  await capture('07-winner-points-and-prize');
  for (const view of views) {
    const safe = await view.page.evaluate(() => {
      const d =
        window.__classicCrazyEightsEngine.currentScene.crazyEightsDriver;
      return [...d.cards].every(([id, r]) =>
        r.personal
          ? d.state.hands[String(d.ctx.meSeatIndex)]?.includes(id)
          : id === d.state.discardPile.at(-1),
      );
    });
    assert.equal(safe, true);
  }
  if (!preview) {
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
    await open('spectator', 7, 1440, 900, false);
    await capture('08-seven-player-spectator');
    const spectator = views.find((v) => v.name === 'spectator')!;
    assert.equal(
      await spectator.page.evaluate(
        () =>
          window.__classicCrazyEightsEngine.currentScene.crazyEightsDriver
            .visibleHand.length,
      ),
      0,
    );
    const phone = views.find((v) => v.name === 'mobile')!;
    for (const [name, field] of [
      ['classic-?', 'howToPlay'],
      ['classic-chat', 'tableChat'],
    ] as const) {
      await tapActor(phone, name);
      await phone.page.waitForFunction(
        (field) => window.__classicCrazyEightsEngine.currentScene[field].isOpen,
        field,
      );
      await phone.page.keyboard.press('Escape');
      await delay(200);
    }
    await tapActor(phone, 'classic-leave-table');
    await phone.page.waitForFunction(
      () => !JSON.parse(localStorage.getItem('lastRoom') || '{}').tableId,
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'proof.json',
    JSON.stringify(
      {
        players: 7,
        independentIdentities: 7,
        desktopAndTwoTouchSizes: !preview,
        wildEightCanvasPlay: wild,
        holdDoesNotSelect: true,
        canvasDraw: draw,
        actualLargestHand: largest,
        largeHandPaging: dense,
        passObserved: pass,
        independentSecondPlayer: secondUi,
        finished: true,
        remainingHandsPrivate: true,
        spectator: !preview,
        headerNavigation: !preview,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('CLASSIC CRAZY EIGHTS PROOF PASSED');
} finally {
  for (const view of views) await view.context.close();
  await browser.close();
  for (const person of people) person.db.disconnect();
}
