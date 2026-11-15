/** Local running-app proof: six independent players, private hands, and actual canvas input. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { orderedRummyHand } from '../client/src/rummy-classic-layout.ts';
import {
  readRummyState,
  rummyRules,
  type RummyState,
  type RummyIntent,
} from '../src/shared/games/rummy.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const playerCount = Number(process.env.RUMMY_PLAYERS ?? 6);
const preview = process.env.RUMMY_PREVIEW === '1';
const viewerOnly = process.env.RUMMY_VIEWER_ONLY === '1';
const baseOut =
  process.env.RUMMY_EVIDENCE_DIR ?? '../docs/classic-rummy-evidence/';
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
  ]
    .slice(0, playerCount)
    .map(connect),
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
    gameType: 'rummy',
    settings: JSON.stringify({
      name: 'Classic Rummy',
      maxPlayers: playerCount,
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
  const state = (): RummyState =>
    readRummyState(JSON.parse(db.gameTable.id.find(table.id)!.stateJson));
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
          ) + '\nwindow.__classicRummyEngine=engine;\n',
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
          window.__classicRummyEngine?.currentScene.lastRow?.id === id &&
          window.__classicRummyEngine.currentScene.rummyDriver.buttonsReady,
        table.id,
      )
      .catch(async (error) => {
        console.log(
          'DEBUG',
          await page.evaluate(() => ({
            scene: window.__classicRummyEngine?.currentScene?.constructor.name,
            row: window.__classicRummyEngine?.currentScene?.lastRow,
            body: document.body.innerText,
          })),
        );
        await page.screenshot({ path: out + 'error.png' });
        throw error;
      });
    views.push({ page, context, name, person: personIndex, mobile });
    console.log('OPEN', name);
  };
  const openingSeat = 0;
  if (viewerOnly) await open('desktop', openingSeat, 1440, 900, false);
  else if (preview) await open('mobile', openingSeat, 844, 390, true);
  else {
    await open('desktop', 1, 1440, 900, false);
    await open('mobile', openingSeat, 844, 390, true);
  }
  const sync = async (): Promise<void> => {
    const actual = JSON.stringify(state());
    for (const view of views)
      await view.page.waitForFunction(
        (actual) =>
          JSON.stringify(
            window.__classicRummyEngine?.currentScene?.rummyDriver?.state,
          ) === actual,
        actual,
      );
  };
  const capture = async (stage: string): Promise<void> => {
    await sync();
    await delay(850);
    for (const view of views)
      await view.page.screenshot({
        path: `${out}${playerCount}-${stage}-${view.name}.png`,
      });
    if (!preview && !viewerOnly) {
      const phone = views.find((v) => v.name === 'mobile')!;
      await phone.page.setViewportSize({ width: 667, height: 375 });
      await delay(700);
      await phone.page.screenshot({
        path: `${out}${playerCount}-${stage}-small-mobile.png`,
      });
      await phone.page.setViewportSize({ width: 844, height: 390 });
      await delay(700);
    }
    console.log('CAPTURED', playerCount, stage);
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
        window.__classicRummyEngine.currentScene.actors.some(
          (actor) =>
            actor.name === name &&
            actor.graphics.isVisible &&
            !actor.isKilled(),
        ),
      name,
    );
    const pos = await view.page.evaluate((name) => {
      const actor = window.__classicRummyEngine.currentScene.actors.find(
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

  const phone = views.find((v) => v.name === 'mobile') ?? views[0];
  const getDriver = async (page: Page) =>
    page.evaluate(() => {
      const s = window.__classicRummyEngine.currentScene,
        d = s.rummyDriver;
      return {
        classic: s.usesClassicLayout,
        hand: d.visibleHand.length,
        pages: d.handPageCount,
        selected: [...d.selected],
        open: d.meldOpen,
        meldIndex: d.meldIndex,
        meldPage: d.meldPage,
        backs: d.backs.size,
        legacy: s.seatActors.length,
      };
    });
  const selectCard = async (
    view: (typeof views)[number],
    card: string,
    chosen = true,
  ): Promise<void> => {
    for (let n = 0; n < 10; n++) {
      const visible = await view.page.evaluate(
        (card) =>
          window.__classicRummyEngine.currentScene.rummyDriver.visibleHand.includes(
            card,
          ),
        card,
      );
      if (visible) {
        const selected = (await getDriver(view.page)).selected.includes(card);
        if (selected !== chosen) await tapActor(view, `rummy-card-${card}`);
        return;
      }
      await tapActor(view, 'rummy-control-hand-next');
    }
    throw Error('Card unavailable ' + card);
  };
  const can = (s: RummyState, intent: RummyIntent): boolean => {
    try {
      rummyRules.applyIntent(s, intent, {
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
      return true;
    } catch {
      return false;
    }
  };
  const findMeld = (s: RummyState): string[] | null => {
    const hand = s.hands[String(s.turnSeatIndex)];
    for (let a = 0; a < hand.length; a++)
      for (let b = a + 1; b < hand.length; b++)
        for (let c = b + 1; c < hand.length; c++) {
          const cards = [hand[a], hand[b], hand[c]];
          if (can(s, { type: 'meld', cards })) return cards;
        }
    return null;
  };
  if (viewerOnly) {
    // Supplemental desktop collection review, without repeating completed full runs.
    for (let n = 0; n < 120 && !state().melds.length; n++) {
      const s = state(),
        seat = s.turnSeatIndex!;
      assert.equal(s.phase, 'play');
      if (!s.drawn) await move(seat, { type: 'draw', source: 'stock' });
      else {
        const cards = findMeld(s);
        await move(
          seat,
          cards
            ? { type: 'meld', cards }
            : { type: 'discard', card: s.hands[String(seat)][0] },
        );
      }
    }
    assert.ok(state().melds.length > 0);
    await sync();
    await tapActor(
      phone,
      state().phase === 'finished' ? 'classic-melds' : 'rummy-control-melds',
    );
    assert.equal((await getDriver(phone.page)).open, true);
    await capture('09-desktop-public-meld-viewer');
    assert.deepEqual(errors, []);
    writeFileSync(
      out + `${playerCount}-desktop-meld-viewer.json`,
      JSON.stringify(
        { realPublicMeld: true, desktopViewer: true, errors },
        null,
        2,
      ),
    );
    console.log('CLASSIC RUMMY DESKTOP VIEWER PASSED');
  } else {
    await capture('01-opening');
    for (const view of views) {
      const d = await getDriver(view.page);
      assert.equal(d.classic, true);
      assert.equal(d.legacy, 0);
      assert.equal(d.backs, (playerCount - 1) * 4);
    }
    // Actual touch hold must inspect without selecting, then Stock/Discard canvas actions replicate.
    const card = orderedRummyHand(state().hands['0'])[0];
    const position = await phone.page.evaluate((card) => {
      const r =
        window.__classicRummyEngine.currentScene.rummyDriver.cards.get(card);
      return { x: r.restX, y: 484 };
    }, card);
    const point = await coords(phone.page, position.x, position.y),
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
    await delay(200);
    assert.equal((await getDriver(phone.page)).selected.length, 0);
    await tapActor(phone, 'rummy-control-draw-stock');
    await until(() => state().drawn, 'Stock draw accepted');
    await capture('02-after-stock-draw');
    let crossedPages = false;
    if (playerCount === 2) {
      assert.equal(state().hands['0'].length, 11);
      await phone.page.setViewportSize({ width: 667, height: 375 });
      await delay(700);
      assert.ok((await getDriver(phone.page)).pages > 1);
      const first = await phone.page.evaluate(
        () =>
          window.__classicRummyEngine.currentScene.rummyDriver.visibleHand[0],
      );
      await selectCard(phone, first);
      await tapActor(phone, 'rummy-control-hand-next');
      const second = await phone.page.evaluate(
        () =>
          window.__classicRummyEngine.currentScene.rummyDriver.visibleHand[0],
      );
      await selectCard(phone, second);
      assert.equal((await getDriver(phone.page)).selected.length, 2);
      await phone.page.screenshot({
        path: `${out}2-03-cross-page-selection-small-mobile.png`,
      });
      await phone.page.setViewportSize({ width: 844, height: 390 });
      await delay(700);
      assert.equal((await getDriver(phone.page)).selected.length, 2);
      crossedPages = true;
      await selectCard(phone, first, false);
      await selectCard(phone, second, false);
    }
    const wanted = ['3S', '4S', '5S', '6S', '7S', '8S', '9S'];
    const initialDiscard = state().hands['0'].find(
      (c) => playerCount !== 2 || !wanted.includes(c),
    )!;
    await selectCard(phone, initialDiscard);
    await capture('03-selected-discard');
    await tapActor(phone, 'rummy-control-discard');
    await until(
      () => state().turnSeatIndex === 1 && !state().drawn,
      'Discard accepted',
    );
    let meldsMade = 0,
      layoff = false,
      publicPage = false,
      stockExhausted = false;
    let independentBrowserActions = false;
    const desktop = views.find((view) => view.name === 'desktop');
    if (desktop) {
      await sync();
      await tapActor(desktop, 'rummy-control-draw-stock');
      await until(
        () => state().drawn,
        'Independent desktop stock draw accepted',
      );
      await sync();
      const discard = state().hands['1'].find((c) => !wanted.includes(c))!;
      await selectCard(desktop, discard);
      await tapActor(desktop, 'rummy-control-discard');
      await until(
        () => state().turnSeatIndex !== 1 && !state().drawn,
        'Independent desktop discard replicated',
      );
      independentBrowserActions = true;
    }
    if (playerCount === 2) {
      // Cooperating legal play routes every desired spade through stock/discard, without changing rules state.
      for (let n = 0; n < 160; n++) {
        const s = state();
        assert.equal(s.phase, 'play');
        const seat = s.turnSeatIndex!;
        if (!s.drawn) {
          const needed = wanted.filter((c) => !s.hands['0'].includes(c));
          const source =
            seat === 0
              ? needed.includes(s.discardPile.at(-1)!)
                ? 'discard'
                : 'stock'
              : 'discard';
          await move(seat, { type: 'draw', source });
          continue;
        }
        if (seat === 0 && wanted.every((c) => s.hands['0'].includes(c))) break;
        const needed = wanted.filter((c) => !s.hands['0'].includes(c));
        const discard =
          seat === 1
            ? (s.hands['1'].find((c) => needed.includes(c)) ??
              s.hands['1'].find((c) => !wanted.includes(c))!)
            : s.hands['0'].find((c) => !wanted.includes(c))!;
        await move(seat, { type: 'discard', card: discard });
      }
      assert.equal(state().turnSeatIndex, 0);
      assert.ok(wanted.every((c) => state().hands['0'].includes(c)));
      await sync();
      await capture('04-run-ready');
      for (const c of wanted.slice(0, 6)) await selectCard(phone, c);
      assert.equal((await getDriver(phone.page)).selected.length, 6);
      await tapActor(phone, 'rummy-control-meld');
      await until(
        () => state().melds.length === 1,
        'Six-card run melded from canvas',
      );
      meldsMade++;
      await tapActor(phone, 'rummy-control-melds');
      if (desktop) await tapActor(desktop, 'rummy-control-melds');
      await selectCard(phone, '9S');
      await tapActor(phone, 'rummy-control-layoff');
      await until(() => state().melds[0].cards.length === 7, 'Layoff accepted');
      layoff = true;
      await capture('05-seven-card-public-run');
      const quiet = await phone.page.evaluate(() => {
        const cards = [
          ...window.__classicRummyEngine.currentScene.rummyDriver.cards.values(),
        ].filter((r) => r.personal);
        return (
          cards.length > 0 &&
          cards.every((r) => {
            const scale = r.actor.graphics.current.scale.x;
            return (
              scale <= 1.35 &&
              r.actor.pos.y + r.actor.graphics.offset.y * scale - 28 * scale >=
                440
            );
          })
        );
      });
      assert.equal(quiet, true);
      // Lower navigation arrow pages the public run, independently of private hand pages.
      const next = await coords(phone.page, 688, 330);
      await phone.page.touchscreen.tap(next.x, next.y);
      await delay(300);
      assert.equal((await getDriver(phone.page)).meldPage, 1);
      publicPage = true;
      await capture('06-public-meld-next-page');
      await tapActor(phone, 'rummy-control-back');
      if (desktop) await tapActor(desktop, 'rummy-control-back');
    }
    // Finish through server-valid draws, melds, layoffs and discards; never expose another private hand.
    for (let n = 0; n < 240 && state().phase !== 'finished'; n++) {
      const s = state(),
        seat = s.turnSeatIndex!;
      if (!s.drawn) {
        await move(seat, {
          type: 'draw',
          source: s.stock.length ? 'stock' : 'discard',
        });
        continue;
      }
      const cards = findMeld(s);
      if (cards) {
        await move(seat, { type: 'meld', cards });
        meldsMade++;
        if (meldsMade === 1) {
          await capture('04-public-meld-created');
          await tapActor(
            phone,
            state().phase === 'finished'
              ? 'classic-melds'
              : 'rummy-control-melds',
          );
          if (desktop)
            await tapActor(
              desktop,
              state().phase === 'finished'
                ? 'classic-melds'
                : 'rummy-control-melds',
            );
          await capture('05-public-meld-browser');
          await tapActor(phone, 'rummy-control-back');
          if (desktop) await tapActor(desktop, 'rummy-control-back');
        }
        continue;
      }
      let laid = false;
      for (let i = 0; i < s.melds.length && !laid; i++)
        for (const card of s.hands[String(seat)])
          if (can(s, { type: 'layoff', meldIndex: i, cards: [card] })) {
            await move(seat, { type: 'layoff', meldIndex: i, cards: [card] });
            layoff = true;
            laid = true;
            break;
          }
      if (laid) continue;
      const discard = s.hands[String(seat)][0];
      if (!s.stock.length) stockExhausted = true;
      await move(seat, { type: 'discard', card: discard });
    }
    assert.equal(state().phase, 'finished');
    await capture('07-final-deadwood');
    for (const view of views) {
      const safe = await view.page.evaluate(() => {
        const d = window.__classicRummyEngine.currentScene.rummyDriver;
        return [...d.cards.values()].every((r) => r.personal);
      });
      assert.equal(safe, true, 'Remaining opponents hands never revealed');
    }
    const viewer = views.find((v) => v.name === 'desktop');
    if (!preview && viewer) {
      await viewer.context.close();
      views.splice(views.indexOf(viewer), 1);
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
      await open('spectator', people.length - 1, 1440, 900, false);
      await capture('08-spectator');
      assert.equal(
        (await getDriver(views.find((v) => v.name === 'spectator')!.page)).hand,
        0,
      );
    }
    if (!preview) {
      for (const target of ['classic-?', 'classic-chat']) {
        await tapActor(phone, target);
        await delay(200);
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
      out + `${playerCount}-proof.json`,
      JSON.stringify(
        {
          players: playerCount,
          uniqueIdentities: playerCount,
          independentBrowserActions,
          holdDoesNotSelect: true,
          canvasStockDiscard: true,
          crossedPages,
          meldsMade,
          layoff,
          publicPage,
          stockExhausted,
          finished: true,
          remainingHandsPrivate: true,
          errors,
        },
        null,
        2,
      ),
    );
    console.log('CLASSIC RUMMY PROOF PASSED', playerCount);
  }
} finally {
  for (const view of views) await view.context.close();
  await browser.close();
  for (const person of people) person.db.disconnect();
}
