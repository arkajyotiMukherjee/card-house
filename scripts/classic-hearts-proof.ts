/** Real local Hearts proof: independent identities, canvas passes/plays and complete game. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import {
  readHeartsState,
  canPlayCard,
  type HeartsState,
} from '../src/shared/games/hearts.ts';
import { orderedHeartsHand } from '../client/src/hearts-classic-layout.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const preview = process.env.HEARTS_PREVIEW === '1';
const single = process.env.HEARTS_SINGLE_VIEW === '1';
const out = fileURLToPath(
  new URL(
    '../docs/classic-hearts-evidence/' +
      (preview ? 'preview/' : single ? 'retained-final/' : ''),
    import.meta.url,
  ),
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
  ['Ava Bennett', 'Ben Harrison', 'Chloe Martin', 'Alexandra Montgomery'].map(
    connect,
  ),
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
    (r) => r.creatorIdentity === host.db.identity!.toHexString(),
  )!;
  for (const p of people)
    await p.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: p.clientId,
      name: p.name,
    });
  await host.db.reducers.createGameTable({
    lobbyId: room.id,
    gameType: 'hearts',
    settings: JSON.stringify({
      name: 'Classic Hearts',
      maxPlayers: 4,
      entryFee: 20,
    }),
  });
  const table = [...db.gameTable.iter()].find((r) => r.lobbyId === room.id)!;
  for (const p of people.slice(1))
    await p.db.reducers.joinTable({
      tableId: table.id,
      lobbyMemberId: `member_${room.id}_${p.clientId}`,
    });
  const state = (): HeartsState =>
    readHeartsState(JSON.parse(db.gameTable.id.find(table.id)!.stateJson));
  const move = async (index: number, intent: unknown): Promise<void> => {
    const before = JSON.stringify(state());
    await people[index].db.reducers.handleGameIntent({
      tableId: table.id,
      clientId: people[index].clientId,
      intentPayload: JSON.stringify(intent),
    });
    await until(() => JSON.stringify(state()) !== before, 'Intent replicated');
    // Do not outrun the retained browser during a synthetic full match.
    if (views.length && state().currentTrick.length === 0) await sync();
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
      ({ clientId, token, code, tableId, name }) => {
        localStorage.setItem('clientId', clientId);
        localStorage.setItem('stdbToken', token);
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, tableId, name }),
        );
      },
      {
        clientId: person.clientId,
        token: person.token,
        code: room.code,
        tableId: table.id,
        name: person.name,
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
          ) + '\nwindow.__classicHeartsEngine=engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('PAGEERROR', error.message);
    });
    await page.goto('http://127.0.0.1:5175/');
    await page.waitForFunction(
      (id) =>
        window.__classicHeartsEngine?.currentScene.lastRow?.id === id &&
        window.__classicHeartsEngine.currentScene.heartsDriver.buttonsReady,
      table.id,
    );
    views.push({ page, context, name, person: personIndex, mobile });
    console.log('OPEN', name);
  };
  if (!preview && !single) await open('desktop', 1, 1440, 900, false);
  await open('mobile', 0, 844, 390, true);
  const sync = async (): Promise<void> => {
    const actual = JSON.stringify(state());
    for (const v of views) {
      try {
        await v.page.waitForFunction(
          (s) =>
            JSON.stringify(
              window.__classicHeartsEngine?.currentScene?.heartsDriver?.state,
            ) === s,
          actual,
        );
      } catch (error) {
        console.log(
          'SYNC DIAGNOSTIC',
          v.name,
          await v.page.evaluate(() => {
            const s = window.__classicHeartsEngine?.currentScene;
            return {
              scene: s?.constructor.name,
              rowId: s?.lastRow?.id,
              rowState: s?.lastRow?.stateJson,
              driverState: s?.heartsDriver?.state,
            };
          }),
        );
        throw error;
      }
    }
  };
  const capture = async (stage: string): Promise<void> => {
    await sync();
    for (const v of views) if (!v.mobile) await v.page.mouse.move(0, 0);
    await delay(850);
    for (const v of views)
      await v.page.screenshot({ path: `${out}${stage}-${v.name}.png` });
    const phone = views.find((v) => v.mobile);
    if (!preview && phone) {
      await phone.page.setViewportSize({ width: 667, height: 375 });
      await delay(700);
      await phone.page.screenshot({ path: `${out}${stage}-small-mobile.png` });
      await phone.page.setViewportSize({ width: 844, height: 390 });
      await delay(600);
    }
    console.log('CAPTURED', stage);
  };
  const coords = async (page: Page, x: number, y: number) => {
    const b = (await page.locator('canvas').boundingBox())!,
      scale = b.height / 540,
      gutter = (b.width / scale - 960) / 2;
    return { x: b.x + (x + gutter) * scale, y: b.y + y * scale };
  };
  const tapActor = async (
    v: (typeof views)[number],
    name: string,
  ): Promise<void> => {
    await v.page.waitForFunction(
      (name) =>
        window.__classicHeartsEngine.currentScene.actors.some(
          (a) => a.name === name && !a.isKilled() && a.graphics.isVisible,
        ),
      name,
    );
    const pos = await v.page.evaluate((name) => {
      const a = window.__classicHeartsEngine.currentScene.actors.find(
        (a) => a.name === name && !a.isKilled() && a.graphics.isVisible,
      );
      return {
        x: a.pos.x + (a.anchor.x === 0 ? a.width / 2 : 0),
        y: a.pos.y + (a.anchor.y === 0 ? a.height / 2 : 0),
      };
    }, name);
    const point = await coords(v.page, pos.x, pos.y);
    if (v.mobile) await v.page.touchscreen.tap(point.x, point.y);
    else await v.page.mouse.click(point.x, point.y);
    await delay(180);
  };
  const select = async (
    v: (typeof views)[number],
    card: string,
  ): Promise<void> => {
    for (let n = 0; n < 5; n++) {
      const d = await v.page.evaluate((id) => {
        const d = window.__classicHeartsEngine.currentScene.heartsDriver;
        return {
          visible: d.visibleHand.includes(id),
          selected: d.selected.has(id),
        };
      }, card);
      if (d.visible) {
        if (!d.selected) {
          await tapActor(v, `hearts-card-${card}`);
          const observed = await v.page.evaluate(() => {
            const d = window.__classicHeartsEngine.currentScene.heartsDriver;
            return {
              selected: [...d.selected],
              page: d.handPage,
              visible: d.visibleHand,
            };
          });
          console.log('SELECT', card, JSON.stringify(observed));
          assert.ok(
            observed.selected.includes(card),
            'Requested canvas card selected',
          );
        }
        return;
      }
      await tapActor(v, 'hearts-control-hand-next');
    }
    throw Error('Card not on reachable page');
  };
  const phone = views.find((v) => v.name === 'mobile')!;
  await capture('01-four-player-pass');
  const initial = orderedHeartsHand(state().hands['0']);
  const capacity = await phone.page.evaluate(
    () =>
      window.__classicHeartsEngine.currentScene.heartsDriver.visibleHand.length,
  );
  assert.ok(capacity < 13);
  const first = initial[0],
    last = initial.at(-1)!;
  const pos = await phone.page.evaluate((id) => {
    const r =
      window.__classicHeartsEngine.currentScene.heartsDriver.cards.get(id);
    return { x: r.restX, y: 484 };
  }, first);
  const point = await coords(phone.page, pos.x, pos.y),
    cdp = await phone.context.newCDPSession(phone.page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await delay(500);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await delay(250);
  assert.equal(
    await phone.page.evaluate(
      () =>
        window.__classicHeartsEngine.currentScene.heartsDriver.selected.size,
    ),
    0,
    'Hold cannot pass-select',
  );
  await select(phone, first);
  await select(phone, last);
  await select(phone, initial[1]);
  assert.equal(
    await phone.page.evaluate(
      () =>
        window.__classicHeartsEngine.currentScene.heartsDriver.selected.size,
    ),
    3,
  );
  await capture('02-three-selected-across-pages');
  assert.equal(
    await phone.page.evaluate(
      () =>
        window.__classicHeartsEngine.currentScene.heartsDriver.selected.size,
    ),
    3,
    'Pass selection survives phone resize and page relayout',
  );
  const selectedRest = await phone.page.evaluate(() => {
    const d = window.__classicHeartsEngine.currentScene.heartsDriver;
    return [...d.cards]
      .filter(([id]) => d.selected.has(id))
      .map(([, r]) => ({
        scale: r.actor.graphics.current.scale.x,
        top:
          r.actor.pos.y +
          r.actor.graphics.offset.y * r.actor.graphics.current.scale.y -
          28 * r.actor.graphics.current.scale.y,
      }));
  });
  assert.ok(
    selectedRest.length > 0 &&
      selectedRest.every((r) => r.scale < 1.5 && r.top >= 428),
  );
  await tapActor(phone, 'hearts-control-pass');
  await until(() => !!state().passes['0'], 'Phone pass accepted');
  await capture('03-pass-submitted');
  for (let seat = 1; seat < 4; seat++)
    await move(seat, {
      type: 'pass',
      cards: orderedHeartsHand(state().hands[String(seat)]).slice(0, 3),
    });
  assert.equal(state().phase, 'play');
  await capture('04-opening-play');
  let trick = false,
    broken = false,
    queen = false,
    right = false,
    across = false,
    hold = false,
    moon = false;
  const uiPlayers = new Set<number>();
  let moves = 0;
  while (state().phase !== 'finished' && moves < 4000) {
    const s = state();
    if (s.phase === 'pass') {
      if (s.handIndex % 4 === 1 && !right) {
        await capture('08-pass-right');
        right = true;
      }
      if (s.handIndex % 4 === 2 && !across) {
        await capture('09-pass-across');
        across = true;
      }
      for (let seat = 0; seat < 4; seat++)
        if (!state().passes[String(seat)])
          await move(seat, {
            type: 'pass',
            cards: orderedHeartsHand(state().hands[String(seat)]).slice(0, 3),
          });
      continue;
    }
    if (s.handIndex % 4 === 3 && !hold) {
      await capture('10-hold-hand');
      hold = true;
    }
    if (!trick && s.currentTrick.length === 3) {
      await capture('05-owner-labelled-trick');
      trick = true;
    }
    if (!broken && s.heartsBroken) {
      await capture('06-hearts-broken');
      broken = true;
    }
    if (
      !queen &&
      Object.values(s.tricksTaken).some((cards) => cards.includes('QS'))
    ) {
      await tapActor(phone, 'hearts-control-scores');
      await capture('07-scores-and-queen');
      const quiet = await phone.page.evaluate(() =>
        [
          ...window.__classicHeartsEngine.currentScene.heartsDriver.cards.values(),
        ]
          .filter((r) => r.personal)
          .every((r) => r.actor.graphics.current.scale.x < 1.5),
      );
      assert.equal(quiet, true);
      await tapActor(phone, 'classic-close');
      queen = true;
    }
    const seat = s.turnSeatIndex!;
    const card = orderedHeartsHand(s.hands[String(seat)]).find((c) =>
      canPlayCard(s, seat, c),
    )!;
    assert.ok(card, 'Legal card exists');
    const view = views.find((v) => v.person === seat);
    if (view && !uiPlayers.has(seat)) {
      await sync();
      await select(view, card);
      await tapActor(view, 'hearts-control-play');
      await until(
        () => JSON.stringify(state()) !== JSON.stringify(s),
        'Canvas play accepted',
      );
      uiPlayers.add(seat);
    } else await move(seat, { type: 'play', card });
    const next = state();
    if (next.handIndex !== s.handIndex || next.phase === 'finished') {
      const deltas = Object.keys(next.scores).map(
        (id) => next.scores[id] - s.scores[id],
      );
      if (deltas.filter((v) => v === 26).length === 3) {
        moon = true;
        await capture('11-shot-the-moon');
      }
    }
    moves++;
    if (moves % 8 === 0) await delay(80);
    if (preview && trick && queen && right) break;
  }
  if (!preview) {
    assert.equal(state().phase, 'finished');
    assert.ok(trick && broken && queen && right && across && hold);
    assert.equal(uiPlayers.size, single ? 1 : 2);
    await capture('12-final-scores-and-prize');
    for (const v of views) {
      const data = await v.page.evaluate(() => {
        const d = window.__classicHeartsEngine.currentScene.heartsDriver;
        return {
          public: [...d.cards.values()].filter((r) => !r.personal).length,
          pass: d.passControl.actor.graphics.isVisible,
          play: d.playControl.actor.graphics.isVisible,
        };
      });
      assert.deepEqual(data, { public: 0, pass: false, play: false });
    }
    for (const target of ['classic-?', 'classic-chat']) {
      await tapActor(phone, target);
      await phone.page.waitForFunction((help) => {
        const s = window.__classicHeartsEngine.currentScene;
        return help ? s.howToPlay.isOpen : s.tableChat.isOpen;
      }, target === 'classic-?');
      await phone.page.keyboard.press('Escape');
      await delay(250);
    }
    const closeViews = async (): Promise<void> => {
      for (const v of views) await v.context.close();
      views.splice(0);
    };
    // Sequential review keeps the GPU budget at one view for paced runs.
    if (single) {
      await closeViews();
      await open('desktop', 1, 1440, 900, false);
      await capture('12-final-scores-and-prize');
      await closeViews();
    } else {
      const desktop = views.find((v) => v.name === 'desktop')!;
      await desktop.context.close();
      views.splice(views.indexOf(desktop), 1);
    }
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
    await open('spectator', 4, 1440, 900, false);
    await capture('13-spectator-results');
    assert.equal(
      await views
        .find((v) => v.name === 'spectator')!
        .page.evaluate(
          () =>
            window.__classicHeartsEngine.currentScene.heartsDriver.visibleHand
              .length,
        ),
      0,
    );
    if (single) {
      await closeViews();
      await open('spectator-mobile', 4, 844, 390, true);
      await capture('13-spectator-results');
      assert.equal(
        await views[0].page.evaluate(
          () =>
            window.__classicHeartsEngine.currentScene.heartsDriver.visibleHand
              .length,
        ),
        0,
      );
      await closeViews();
      await open('mobile', 0, 844, 390, true);
    }
    const leaveView = views.find((v) => v.name === 'mobile')!;
    await tapActor(leaveView, 'classic-leave-table');
    await leaveView.page.waitForFunction(
      () => !JSON.parse(localStorage.getItem('lastRoom') || '{}').tableId,
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'proof.json',
    JSON.stringify(
      {
        players: 4,
        identities: 4,
        desktopAndBothPhoneSizes: !preview,
        pacedSingleRetainedView: single,
        initialCards: 13,
        widePages: 2,
        passThreeAcrossPages: true,
        holdDoesNotSelect: true,
        canvasPass: true,
        canvasPlayIdentities: uiPlayers.size,
        trick,
        broken,
        queen,
        right,
        across,
        hold,
        moonObserved: moon,
        finished: state().phase === 'finished',
        remainingHandsPrivate: true,
        spectatorAndNavigation: !preview,
        moves,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('HEARTS PROOF PASSED', moves);
} finally {
  for (const v of views) await v.context.close();
  await browser.close();
  for (const p of people) p.db.disconnect();
}
