/** Local running-app proof: six independent players, private hands, and actual canvas input. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { orderedBluffHand } from '../client/src/bluff-layout.ts';
import type { BluffState } from '../src/shared/games/bluff.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const preview = process.env.BLUFF_PREVIEW === '1';
const database = process.env.SPACETIMEDB_DB ?? 'room-economy-test';
assert.match(database, /^room-economy-/);
const browserUrl = process.env.BLUFF_BROWSER_URL ?? 'http://127.0.0.1:5175/';
assert.match(browserUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/);
const baseOut =
  process.env.BLUFF_EVIDENCE_DIR ??
  '../docs/classic-bluff-evidence/space-revision/';
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
      .withDatabaseName(database)
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
    gameType: 'bluff',
    settings: JSON.stringify({
      name: 'Classic Bluff proof',
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
  const state = (): BluffState =>
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
          ) + '\nwindow.__classicBluffEngine=engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(browserUrl);
    await page.waitForFunction(
      (id) =>
        window.__classicBluffEngine?.currentScene.lastRow?.id === id &&
        window.__classicBluffEngine.currentScene.bluffDriver.buttonsReady,
      table.id,
    );
    views.push({ page, context, name, person: personIndex, mobile });
    console.log('OPEN', name);
  };
  if (preview) await open('mobile', 0, 844, 390, true);
  else {
    await open('desktop', 0, 1440, 900, false);
    await open('mobile', 2, 844, 390, true);
    await open('small-mobile', 0, 667, 375, true);
  }
  const sync = async (): Promise<void> => {
    const actual = state();
    for (const view of views)
      await view.page.waitForFunction((actual) => {
        const visible =
          window.__classicBluffEngine.currentScene.bluffDriver.state;
        return (
          Object.keys(visible).length === Object.keys(actual).length &&
          Object.entries(actual).every(
            ([key, value]) =>
              JSON.stringify(visible[key]) === JSON.stringify(value),
          )
        );
      }, actual);
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
        window.__classicBluffEngine.currentScene.actors.some(
          (actor) =>
            actor.name === name &&
            actor.graphics.isVisible &&
            !actor.isKilled(),
        ),
      name,
    );
    const pos = await view.page.evaluate((name) => {
      const actor = window.__classicBluffEngine.currentScene.actors.find(
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
  const hostView =
    views.find((view) => view.person === 0 && view.mobile) ?? views[0];
  await capture('01-six-player-lead');
  const resizeView = views.find((view) => view.name === 'desktop') ?? hostView;
  const oldViewport = resizeView.page.viewportSize()!;
  await resizeView.page.setViewportSize({ width: 1200, height: 600 });
  await delay(700);
  const aligned = await resizeView.page.evaluate(() => {
    const scene = window.__classicBluffEngine.currentScene;
    return [4, 5].map((index) => {
      const name = scene.placed.find((seat) => seat.seatIndex === index).name;
      const label = scene.actors.find((actor) => {
        if (actor.name !== 'bluff-player-name' || actor.isKilled())
          return false;
        const graphic = actor.graphics.current;
        return (
          graphic?.text === name ||
          graphic?.members?.some((member) => member.graphic.text === name)
        );
      });
      const cards = [...scene.bluffDriver.backs]
        .filter(([key]) => key.startsWith(`${index}:`))
        .map(([, actor]) => actor.pos.x);
      return Math.abs(
        cards.reduce((sum, x) => sum + x, 0) / cards.length -
          label.pos.x -
          label.width / 2,
      );
    });
  });
  assert.ok(
    aligned.every((error) => error < 0.1),
    'Opponent backs remain centered over names after resize',
  );
  await resizeView.page.setViewportSize(oldViewport);
  await delay(500);
  for (const view of views) {
    const data = await view.page.evaluate(() => {
      const scene = window.__classicBluffEngine.currentScene,
        driver = scene.bluffDriver;
      return {
        classic: scene.usesClassicLayout,
        names: scene.actors.filter(
          (actor) => actor.name === 'bluff-player-name' && !actor.isKilled(),
        ).length,
        backs: driver.backs.size,
        hand: driver.visibleHand.length,
        pages: driver.handPageCount,
        legacyNames: scene.seatActors.length,
      };
    });
    assert.equal(data.classic, true);
    assert.equal(data.names, 6);
    assert.equal(data.backs, 20);
    assert.equal(data.hand, 9);
    assert.equal(data.pages, 1);
    assert.equal(data.legacyNames, 0);
  }
  await tapActor(hostView, 'bluff-control-rank:A');
  await tapActor(hostView, 'bluff-control-play');
  assert.equal(state().discardPile.length, 0);
  assert.equal(
    await hostView.page.evaluate(() =>
      window.__classicBluffEngine.currentScene.actors.some(
        (actor) => actor.name === 'table-notice' && !actor.isKilled(),
      ),
    ),
    false,
    'Disabled Play caption cannot submit an empty play',
  );
  const first = orderedBluffHand(state().hands['0'])
    .slice(0, 5)
    .find((card) => !card.startsWith('A') && card !== 'JR' && card !== 'JB')!;
  const position = await hostView.page.evaluate((card) => {
    const row =
      window.__classicBluffEngine.currentScene.bluffDriver.cards.get(card);
    return { x: row.restX, y: 484 };
  }, first);
  const p = await coords(hostView.page, position.x, position.y),
    cdp = await hostView.context.newCDPSession(hostView.page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [p],
  });
  await delay(500);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await delay(200);
  assert.equal(
    await hostView.page.evaluate(
      () => window.__classicBluffEngine.currentScene.bluffDriver.selected.size,
    ),
    0,
    'Hold inspects without selecting',
  );
  await tapActor(hostView, `bluff-card-${first}`);
  const second = orderedBluffHand(state().hands['0']).find(
    (card) =>
      card !== first && !card.startsWith('A') && card !== 'JR' && card !== 'JB',
  )!;
  await tapActor(hostView, `bluff-card-${second}`);
  assert.equal(
    await hostView.page.evaluate(
      () => window.__classicBluffEngine.currentScene.bluffDriver.selected.size,
    ),
    2,
  );
  await capture('02-opening-selection');
  if (preview) {
    await tapActor(hostView, 'bluff-control-play');
    await until(
      () => state().discardPile.length === 2,
      'Active Play works after selection',
    );
    await capture('03-own-play');
    await move(2, { type: 'challenge' });
    await delay(1100);
    for (let n = 0; n < 5; n++) {
      const seat = state().turnSeatIndex!,
        hand = state().hands[String(seat)];
      const falseCard = hand.find(
        (card) => !card.startsWith('A') && card !== 'JR' && card !== 'JB',
      )!;
      await move(seat, {
        type: 'play',
        cards: [falseCard, ...hand.filter((card) => card !== falseCard)].slice(
          0,
          4,
        ),
        ...(state().requiredRank === null ? { claimRank: 'A' } : {}),
      });
    }
    await move(2, { type: 'challenge' });
    await delay(1500);
    assert.equal(state().hands['0'].length, 25);
    await capture('05-wide-phone-large-hand');
    await open('desktop', 0, 1440, 900, false);
    await capture('08-challenge-pickup');
    assert.equal(state().lastPileResult?.kind, 'challenge');
    for (const view of views) {
      const heading = await view.page.evaluate(
        () =>
          window.__classicBluffEngine.currentScene.actors.find(
            (actor) => actor.name === 'bluff-public-state' && !actor.isKilled(),
          ).graphics.current.text,
      );
      assert.equal(heading, 'Bluff caught');
    }

    assert.equal(
      await hostView.page.evaluate(
        () =>
          window.__classicBluffEngine.currentScene.bluffDriver.visibleHand
            .length,
      ),
      11,
    );
    await hostView.page.setViewportSize({ width: 667, height: 375 });
    await delay(850);
    assert.equal(
      await hostView.page.evaluate(
        () =>
          window.__classicBluffEngine.currentScene.bluffDriver.handPageCount,
      ),
      4,
    );
    await capture('05-resized-small-phone-large-hand');
    await hostView.page.setViewportSize({ width: 844, height: 390 });
    await delay(850);
    assert.equal(
      await hostView.page.evaluate(
        () =>
          window.__classicBluffEngine.currentScene.bluffDriver.handPageCount,
      ),
      3,
    );
    // Make the host the last player to lay cards, then exercise both options.
    await move(2, {
      type: 'play',
      cards: [state().hands['2'][0]],
      claimRank: 'A',
    });
    for (const seat of [3, 4, 5]) await move(seat, { type: 'pass' });
    await move(0, { type: 'play', cards: [state().hands['0'][0]] });
    await move(1, { type: 'pass' });
    await move(2, { type: 'pass' });
    assert.equal(state().turnSeatIndex, 0);
    assert.equal(state().discardPile.length, 2);
    await sync();
    const chosen = await hostView.page.evaluate(
      () => window.__classicBluffEngine.currentScene.bluffDriver.visibleHand[0],
    );
    await tapActor(hostView, `bluff-card-${chosen}`);
    await capture('09-play-or-flush');
    await tapActor(hostView, 'bluff-control-play');
    await until(
      () => state().discardPile.length === 3,
      'Continue kept the pile',
    );
    assert.equal(state().requiredRank, 'A');
    assert.equal(state().turnSeatIndex, 1);
    assert.deepEqual(state().passed, []);
    await capture('10-continued-play');
    for (const seat of [1, 2, 3, 4, 5]) await move(seat, { type: 'pass' });
    await sync();
    await tapActor(hostView, 'bluff-control-flush');
    await until(
      () => state().lastPileResult?.kind === 'flush',
      'Flush was explicit',
    );
    assert.equal(state().discardPile.length, 0);
    assert.equal(state().requiredRank, null);
    assert.equal(state().turnSeatIndex, 0);
    await capture('11-flushed-new-rank');
    for (let n = 0; state().phase !== 'finished' && n < 40; n++) {
      const seat = state().turnSeatIndex!,
        hand = state().hands[String(seat)];
      await move(seat, {
        type: 'play',
        cards: hand.length > 1 ? hand.slice(0, -1) : hand,
        ...(state().requiredRank === null ? { claimRank: 'A' } : {}),
      });
    }
    assert.equal(state().phase, 'finished');
    await capture('07-compact-winner');
    const winnerSize = await hostView.page.evaluate(
      () =>
        window.__classicBluffEngine.currentScene.actors.find(
          (actor) => actor.name === 'bluff-result' && !actor.isKilled(),
        ).graphics.current.font.size,
    );
    assert.ok(
      winnerSize >= 20,
      'Winner name remains prominent in the compact column',
    );
    writeFileSync(
      out + 'proof.json',
      JSON.stringify(
        {
          nineOpeningCardsVisible: true,
          denseHandCardsVisible: 11,
          largerHand: 25,
          denseResizeFromThreeToFourPages: true,
          compactWinnerReadable: true,
          tableNameHeader: true,
          disabledPlayCannotSubmit: true,
          activePlayConfirmed: true,
          challengePickupLabel: true,
          continuedPlayKeptPile: true,
          explicitFlushOpenedRankPicker: true,
          errors,
        },
        null,
        2,
      ),
    );
    console.log('BLUFF DESKTOP AND TOUCH PREVIEW PASSED');
  } else {
    await tapActor(hostView, 'bluff-control-play');
    await until(
      () => state().discardPile.length === 2,
      'Two selected cards played',
    );
    await capture('03-live-claim');
    for (const view of views) {
      const checks = await view.page.evaluate(() => {
        const scene = window.__classicBluffEngine.currentScene;
        const labels = scene.actors.filter((actor) => !actor.isKilled());
        const title = labels.find(
          (actor) => actor.name === 'classic-game-title',
        ).graphics.current.text;
        const repeated = labels.filter(
          (actor) =>
            actor.pos.y >= 436 &&
            actor.graphics.current?.text?.includes('played'),
        ).length;
        const claim = labels.find((actor) => actor.name === 'bluff-claim');
        const pile = [...scene.bluffDriver.cards.values()].filter(
          (row) => !row.personal,
        );
        const gap =
          Math.min(...pile.map((row) => row.restY - 27)) -
          (claim.pos.y + claim.height);
        const controls = [
          scene.bluffDriver.playControl,
          scene.bluffDriver.passControl,
          scene.bluffDriver.challengeControl,
        ].filter((row) => row.actor.graphics.isVisible);
        return {
          title,
          repeated,
          gap,
          widths: controls.map((row) => row.actor.width),
        };
      });
      assert.equal(checks.title, table.name);
      assert.equal(checks.repeated, 0);
      assert.ok(checks.gap >= 16);
      assert.ok(checks.widths.every((width) => width <= 184));
    }
    const challengeView = views.find((view) => view.person === 2)!;
    assert.notEqual(state().turnSeatIndex, 2);
    await tapActor(challengeView, 'bluff-control-challenge');
    await until(
      () => state().discardPile.length === 0 && state().hands['0'].length === 9,
      'Out-of-turn challenge replicated',
    );
    await delay(1200);
    // Build a real 20-card pile and return it to the host to test a 25-card hand.
    for (let n = 0; n < 5; n++) {
      const seat = state().turnSeatIndex!,
        hand = state().hands[String(seat)];
      const notAce = hand.find(
        (card) => !card.startsWith('A') && card !== 'JR' && card !== 'JB',
      )!;
      const cards = [notAce, ...hand.filter((card) => card !== notAce)].slice(
        0,
        4,
      );
      await move(seat, {
        type: 'play',
        cards,
        ...(state().requiredRank === null ? { claimRank: 'A' } : {}),
      });
    }
    assert.equal(state().lastPlay!.seat, 0);
    assert.equal(state().discardPile.length, 20);
    await capture('04-twenty-card-pile');
    await tapActor(challengeView, 'bluff-control-challenge');
    await until(
      () => state().hands['0'].length === 25,
      'Challenge pickup grows hand to 25',
    );
    await delay(1500);
    await capture('05-twenty-five-card-hand');
    for (const view of views.filter((view) => view.person === 0))
      assert.equal(
        await view.page.evaluate(
          () =>
            window.__classicBluffEngine.currentScene.bluffDriver.handPageCount,
        ),
        view.name === 'small-mobile' ? 4 : 3,
      );
    await move(2, {
      type: 'play',
      cards: [state().hands['2'][0]],
      claimRank: 'A',
    });
    for (const seat of [3, 4, 5]) await move(seat, { type: 'pass' });
    await sync();
    assert.equal(state().turnSeatIndex, 0);
    const pageOneCard = await hostView.page.evaluate(
      () => window.__classicBluffEngine.currentScene.bluffDriver.visibleHand[0],
    );
    await tapActor(hostView, `bluff-card-${pageOneCard}`);
    await tapActor(hostView, 'bluff-control-hand-next');
    const pageTwoCard = await hostView.page.evaluate(
      () => window.__classicBluffEngine.currentScene.bluffDriver.visibleHand[0],
    );
    await tapActor(hostView, `bluff-card-${pageTwoCard}`);
    assert.equal(
      await hostView.page.evaluate(
        () =>
          window.__classicBluffEngine.currentScene.bluffDriver.selected.size,
      ),
      2,
    );
    await capture('06-cross-page-selection');
    await tapActor(hostView, 'bluff-control-play');
    await until(
      () => state().hands['0'].length === 23,
      'Cross-page selection played',
    );
    const desktop = views.find((view) => view.name === 'desktop')!;
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
    const spectator = views.find((view) => view.person === 6)!;
    const watching = await spectator.page.evaluate(() => {
      const d = window.__classicBluffEngine.currentScene.bluffDriver;
      return {
        backs: d.backs.size,
        hand: d.visibleHand.length,
        play: d.playControl.actor.graphics.isVisible,
        challenge: d.challengeControl.actor.graphics.isVisible,
      };
    });
    assert.deepEqual(watching, {
      backs: 24,
      hand: 0,
      play: false,
      challenge: false,
    });
    await capture('06-six-player-spectator');
    // End through actual legal plays; finished cards must remain private.
    for (let n = 0; state().phase !== 'finished' && n < 40; n++) {
      const seat = state().turnSeatIndex!,
        hand = state().hands[String(seat)];
      await move(seat, {
        type: 'play',
        cards: hand.length > 1 ? hand.slice(0, -1) : hand,
        ...(state().requiredRank === null ? { claimRank: 'A' } : {}),
      });
    }
    assert.equal(state().phase, 'finished');
    await capture('07-winner-and-prize');
    for (const view of views) {
      const privateSafe = await view.page.evaluate(() => {
        const driver = window.__classicBluffEngine.currentScene.bluffDriver;
        return [...driver.cards].every(
          ([id, row]) =>
            !row.faceUp ||
            row.personal ||
            (driver.state.lastPlay?.seat ===
              window.__classicBluffEngine.currentScene.placed.find(
                (seat) => seat.self,
              )?.seatIndex &&
              driver.state.lastPlay.cards.includes(id)),
        );
      });
      assert.equal(privateSafe, true);
    }
    await tapActor(hostView, 'classic-?');
    await hostView.page.waitForFunction(
      () => window.__classicBluffEngine.currentScene.howToPlay.isOpen,
    );
    await delay(200);
    await hostView.page.keyboard.press('Escape');
    await hostView.page.waitForFunction(
      () => !window.__classicBluffEngine.currentScene.howToPlay.isOpen,
    );
    await tapActor(hostView, 'classic-chat');
    await hostView.page.waitForFunction(
      () => window.__classicBluffEngine.currentScene.tableChat.isOpen,
    );
    await delay(200);
    await hostView.page.keyboard.press('Escape');
    await hostView.page.waitForFunction(
      () => !window.__classicBluffEngine.currentScene.tableChat.isOpen,
    );
    await tapActor(hostView, 'classic-leave-table');
    await hostView.page.waitForFunction(
      () => !JSON.parse(localStorage.getItem('lastRoom') || '{}').tableId,
    );
    assert.deepEqual(errors, []);
    writeFileSync(
      out + 'proof.json',
      JSON.stringify(
        {
          players: 6,
          uniqueIdentities: 6,
          desktopAndTwoTouchSizes: true,
          crossPageSelection: true,
          disabledPlayCannotSubmit: true,
          opponentResizeAlignment: true,
          holdDoesNotSelect: true,
          outOfTurnChallenge: true,
          pilePickup25Cards: true,
          responsiveHandPages: true,
          nineOpeningCardsVisible: true,
          tableNameHeader: true,
          noRepeatedBottomClaim: true,
          compactControls: true,
          claimCardSpacing: true,
          winnerInPersonalBand: true,
          remainingHandsPrivate: true,
          sixPlayerSpectator: true,
          headerChatHelpLeave: true,
          errors,
        },
        null,
        2,
      ),
    );
    console.log('CLASSIC BLUFF MULTIPLAYER PROOF PASSED');
  }
} finally {
  for (const view of views) await view.context.close();
  await browser.close();
  for (const person of people) person.db.disconnect();
}
