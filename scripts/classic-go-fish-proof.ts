/** Local running-app proof: six independent players, private hands, and actual canvas input. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { orderedGoFishHand } from '../client/src/go-fish-classic-layout.ts';
import {
  GO_FISH_RANKS,
  rankOfCard,
  readGoFishState,
  type GoFishState,
} from '../src/shared/games/go-fish.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const preview = process.env.GO_FISH_PREVIEW === '1';
const baseOut =
  process.env.GO_FISH_EVIDENCE_DIR ?? '../docs/classic-go-fish-evidence/';
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
    gameType: 'go_fish',
    settings: JSON.stringify({
      name: 'Classic Go Fish',
      maxPlayers: 6,
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
  const state = (): GoFishState =>
    readGoFishState(JSON.parse(db.gameTable.id.find(table.id)!.stateJson));
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
          ) + '\nwindow.__classicGoFishEngine=engine;\n',
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
          window.__classicGoFishEngine?.currentScene.lastRow?.id === id &&
          window.__classicGoFishEngine.currentScene.goFishDriver.buttonsReady,
        table.id,
      )
      .catch(async (error) => {
        console.log(
          'DEBUG',
          await page.evaluate(() => ({
            scene: window.__classicGoFishEngine?.currentScene?.constructor.name,
            row: window.__classicGoFishEngine?.currentScene?.lastRow,
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
  if (preview) await open('mobile', openingSeat, 844, 390, true);
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
            window.__classicGoFishEngine?.currentScene?.goFishDriver?.state,
          ) === actual,
        actual,
      );
  };
  const capture = async (stage: string): Promise<void> => {
    await sync();
    await delay(850);
    for (const view of views)
      await view.page.screenshot({ path: `${out}${stage}-${view.name}.png` });
    if (!preview) {
      const phone = views.find((view) => view.name === 'mobile')!;
      await phone.page.setViewportSize({ width: 667, height: 375 });
      await delay(700);
      if (stage === '05-selected-rank-dense-hand') {
        const selected = (await getDriver(phone.page)).rank;
        assert.ok(selected, 'Selected rank survives small-phone resize');
        observedSmallPages = (await getDriver(phone.page)).pages;
        const card = orderedGoFishHand(state().hands['0']).find(
          (id) => rankOfCard(id) === selected,
        )!;
        await selectCard(phone, card);
        const data = await phone.page.evaluate(() => {
          const d = window.__classicGoFishEngine.currentScene.goFishDriver;
          return {
            rank: d.selectedRank,
            targets: [...d.targetControls.values()].filter(
              (c) => c.actor.graphics.isVisible,
            ).length,
            cards: [...d.cards]
              .filter(([id]) => id.slice(0, -1) === d.selectedRank)
              .map(([, r]) => ({
                scale: r.actor.graphics.current.scale.x,
                top:
                  r.actor.pos.y +
                  r.actor.graphics.offset.y * r.actor.graphics.current.scale.y -
                  28 * r.actor.graphics.current.scale.y,
              })),
          };
        });
        assert.equal(data.rank, selected);
        assert.ok(data.targets > 0, 'Chooser must actually be visible');
        assert.equal(
          data.cards.length,
          3,
          'All three selected cards remain visible',
        );
        assert.ok(
          data.cards.every((r) => r.scale < 1.5 && r.top >= 428),
          'Selected triple clears all target controls on small phone',
        );
        observedSmallPages = (await getDriver(phone.page)).pages;
        assert.ok(
          observedSmallPages > 1,
          'Dense phone hand pages without shrinking cards',
        );
        await tapActor(phone, 'go-fish-control-hand-next');
        assert.equal(
          (await getDriver(phone.page)).rank,
          selected,
          'Rank selection survives paging',
        );
        await selectCard(phone, card);
      }
      if (stage === '06-book-collection') {
        const quiet = await phone.page.evaluate(() =>
          [
            ...window.__classicGoFishEngine.currentScene.goFishDriver.cards.values(),
          ].every(
            (r) =>
              r.actor.graphics.current.scale.x <= 1.35 &&
              r.actor.pos.y +
                r.actor.graphics.offset.y * r.actor.graphics.current.scale.y -
                28 * r.actor.graphics.current.scale.y >=
                440,
          ),
        );
        assert.equal(
          quiet,
          true,
          'Collection suppresses hover and selection lift',
        );
      }
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
        window.__classicGoFishEngine.currentScene.actors.some(
          (actor) =>
            actor.name === name &&
            actor.graphics.isVisible &&
            !actor.isKilled(),
        ),
      name,
    );
    const pos = await view.page.evaluate((name) => {
      const actor = window.__classicGoFishEngine.currentScene.actors.find(
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
  const hostView = views.find((v) => v.name === 'mobile')!;
  const getDriver = async (page: Page) =>
    page.evaluate(() => {
      const scene = window.__classicGoFishEngine.currentScene,
        driver = scene.goFishDriver;
      return {
        classic: scene.usesClassicLayout,
        backs: driver.backs.size,
        hand: driver.visibleHand.length,
        pages: driver.handPageCount,
        rank: driver.selectedRank,
        books: driver.booksOpen,
        legacy: scene.seatActors.length,
      };
    });
  const selectCard = async (view: (typeof views)[number], card: string) => {
    for (let i = 0; i < 10; i++) {
      const visible = await view.page.evaluate(
        (card) =>
          window.__classicGoFishEngine.currentScene.goFishDriver.visibleHand.includes(
            card,
          ),
        card,
      );
      if (visible) {
        const selected = await view.page.evaluate(
          () =>
            window.__classicGoFishEngine.currentScene.goFishDriver.selectedRank,
        );
        if (selected === rankOfCard(card)) return;
        await tapActor(view, `go-fish-card-${card}`);
        return;
      }
      await tapActor(view, 'go-fish-control-hand-next');
    }
    throw Error('Card not found on any page');
  };
  await capture('01-six-player-opening');
  for (const view of views) {
    const d = await getDriver(view.page);
    assert.equal(d.classic, true);
    assert.equal(d.backs, 20);
    assert.equal(d.legacy, 0);
    assert.equal(d.hand, 5);
  }
  // A long hold inspects without selecting; empty Ask must be a dead hit target.
  await tapActor(hostView, 'go-fish-control-ask');
  assert.equal(state().lastAsk, null);
  const first = orderedGoFishHand(state().hands['0'])[0];
  const rest = await hostView.page.evaluate((card) => {
    const r =
      window.__classicGoFishEngine.currentScene.goFishDriver.cards.get(card);
    return { x: r.restX, y: 484 };
  }, first);
  const point = await coords(hostView.page, rest.x, rest.y),
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
  await delay(250);
  assert.equal((await getDriver(hostView.page)).rank, null);
  await selectCard(hostView, first);
  await tapActor(hostView, 'go-fish-control-target:5');
  await capture('02-select-rank-and-target');
  for (const view of views.filter((v) => v.person === 0)) {
    const fit = await view.page.evaluate(() => {
      const d = window.__classicGoFishEngine.currentScene.goFishDriver;
      return [...d.targetControls.values()]
        .filter((c) => c.actor.graphics.isVisible)
        .map((c) => ({
          width: c.text.width,
          available: c.face.width - 12,
          label: c.text.text,
        }));
    });
    assert.equal(fit.length, 5);
    assert.ok(fit.every((x) => x.width <= x.available));
  }
  await tapActor(hostView, 'go-fish-control-ask');
  await until(() => state().lastAsk !== null, 'Canvas Ask accepted');
  await capture('03-public-ask-result');
  const choose = (grow: boolean) => {
    const s = state(),
      seat = s.turnSeatIndex!,
      hand = s.hands[String(seat)];
    const ranks = [...new Set(hand.map(rankOfCard))].filter(
      Boolean,
    ) as string[];
    const targets = Object.keys(s.hands)
      .map(Number)
      .filter((n) => n !== seat && s.hands[String(n)].length);
    const candidates = ranks.flatMap((rank) =>
      targets.map((targetSeat) => ({
        type: 'ask',
        rank,
        targetSeat,
        given: s.hands[String(targetSeat)].filter((c) => rankOfCard(c) === rank)
          .length,
        own: hand.filter((c) => rankOfCard(c) === rank).length,
      })),
    );
    let choice;
    if (grow && seat === 0)
      choice =
        candidates
          .filter((c) => c.given && c.own + c.given < 4)
          .sort((a, b) => b.given - a.given)[0] ??
        candidates.find((c) => !c.given);
    else if (grow)
      choice =
        candidates.find((c) => !c.given && c.targetSeat !== 0) ??
        candidates.find((c) => !c.given);
    choice ??=
      candidates.filter((c) => c.given).sort((a, b) => b.given - a.given)[0] ??
      candidates[0];
    if (!choice) throw Error('No ask candidate');
    return { type: 'ask', targetSeat: choice.targetSeat, rank: choice.rank };
  };
  let dense = false,
    triple = false,
    books = false,
    opponentUi = false,
    observedDenseCards = 0,
    observedWidePages = 0,
    observedSmallPages = 0;
  for (let n = 0; n < 400 && state().phase !== 'finished'; n++) {
    const s = state(),
      seat = s.turnSeatIndex!;
    if (
      !dense &&
      s.hands['0'].length >= (s.stock.length ? 13 : 12) &&
      seat === 0 &&
      GO_FISH_RANKS.some(
        (rank) =>
          s.hands['0'].filter((card) => rankOfCard(card) === rank).length === 3,
      )
    ) {
      await capture('04-large-hand');
      dense = true;
      observedDenseCards = s.hands['0'].length;
      observedWidePages = (await getDriver(hostView.page)).pages;
      const ordered = orderedGoFishHand(s.hands['0']);
      const groups = GO_FISH_RANKS.map((rank) =>
        ordered.filter((c) => rankOfCard(c) === rank),
      );
      const group =
        groups.find(
          (g) =>
            g.length === 3 &&
            Math.floor(ordered.indexOf(g[0]) / 8) ===
              Math.floor((ordered.indexOf(g[0]) + 2) / 8) &&
            Math.floor(ordered.indexOf(g[0]) / 11) ===
              Math.floor((ordered.indexOf(g[0]) + 2) / 11),
        ) ?? groups.find((g) => g.length === 3)!;
      assert.ok(group, 'An actual three-card held rank is available');
      await selectCard(hostView, group[0]);
      await capture('05-selected-rank-dense-hand');
      triple = group.length === 3;
      const safe = await hostView.page.evaluate(() => {
        const d = window.__classicGoFishEngine.currentScene.goFishDriver;
        return [...d.cards]
          .filter(([id]) => id.slice(0, -1) === d.selectedRank)
          .map(([, r]) => ({
            scale: r.actor.graphics.current.scale.x,
            top:
              r.actor.pos.y +
              r.actor.graphics.offset.y * r.actor.graphics.current.scale.y -
              28 * r.actor.graphics.current.scale.y,
          }));
      });
      assert.equal((await getDriver(hostView.page)).rank, rankOfCard(group[0]));
      assert.equal(
        safe.length,
        3,
        'All three selected cards are present in the dense hand',
      );
      assert.ok(
        safe.every((r) => r.scale < 1.5 && r.top >= 428),
        'Selected rank stays clear of target chooser',
      );
      await tapActor(hostView, 'go-fish-control-books');
      await capture('06-book-collection');
      assert.equal((await getDriver(hostView.page)).books, true);
      await tapActor(hostView, 'classic-close');
    }
    if (!books && Object.values(s.books).some((list) => list.length >= 2)) {
      await tapActor(hostView, 'go-fish-control-books');
      await capture('06-book-collection');
      books = true;
      await tapActor(hostView, 'classic-close');
    }
    if (!preview && !opponentUi && seat === 1) {
      const view = views.find((v) => v.person === 1)!,
        intent = choose(!dense && state().stock.length > 0);
      const card = s.hands['1'].find((c) => rankOfCard(c) === intent.rank)!;
      await selectCard(view, card);
      await tapActor(view, `go-fish-control-target:${intent.targetSeat}`);
      await tapActor(view, 'go-fish-control-ask');
      await until(
        () => JSON.stringify(state()) !== JSON.stringify(s),
        'Second player UI ask replicated',
      );
      opponentUi = true;
    } else await move(seat, choose(!dense && state().stock.length > 0));
  }
  assert.equal(state().phase, 'finished');
  await capture('07-final-books-and-prize');
  for (const view of views) {
    const privacy = await view.page.evaluate(() => {
      const s = window.__classicGoFishEngine.currentScene,
        d = s.goFishDriver;
      return [...d.cards].every(
        ([id]) =>
          d.ctx.meSeatIndex !== null &&
          d.state.hands[String(d.ctx.meSeatIndex)]?.includes(id),
      );
    });
    assert.equal(privacy, true);
  }
  // Spectator sees public books, never anybody's remaining hand.
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
    await open('spectator', 6, 1440, 900, false);
    await capture('08-six-player-spectator');
    assert.equal(
      (await getDriver(views.find((v) => v.person === 6)!.page)).hand,
      0,
    );
    for (const target of ['classic-?', 'classic-chat']) {
      await tapActor(hostView, target);
      await delay(250);
      await hostView.page.keyboard.press('Escape');
      await delay(250);
    }
    await tapActor(hostView, 'classic-leave-table');
    await hostView.page.waitForFunction(
      () => !JSON.parse(localStorage.getItem('lastRoom') || '{}').tableId,
    );
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'proof.json',
    JSON.stringify(
      {
        players: 6,
        uniqueIdentities: 6,
        desktopAndBothTouchSizes: !preview,
        holdDoesNotSelect: true,
        disabledAskCannotSubmit: true,
        rankAndTargetCanvasAsk: true,
        secondPlayerCanvasAsk: opponentUi,
        longTargetNamesFit: true,
        denseHand: dense,
        observedDenseCards,
        observedWidePages,
        observedSmallPages,
        selectedTriple: triple,
        bookCollection: books,
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
  console.log('CLASSIC GO FISH PROOF PASSED');
} finally {
  for (const v of views) await v.context.close();
  await browser.close();
  for (const p of people) p.db.disconnect();
}
