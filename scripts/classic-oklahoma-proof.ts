/** Local-only approval evidence: real identities/reducers, actual canvas pointer actions. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { pokerCanCheck } from '../src/shared/games/poker.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = fileURLToPath(
  new URL(
    process.env.CLASSIC_EVIDENCE_DIR ?? '../docs/classic-poker-evidence/',
    import.meta.url,
  ),
);
mkdirSync(out, { recursive: true });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string) {
  const end = Date.now() + 20000;
  while (!check()) {
    if (Date.now() > end) throw Error(label);
    await delay(20);
  }
}
async function connect(name: string) {
  let token = '';
  const db = await new Promise<DbConnection>((resolve, reject) => {
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
      .build();
  });
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
    'Gia Williams',
    'Hugo Ramirez',
  ].map(connect),
);
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const errors: string[] = [];
const views: { page: Page; name: string; person: number }[] = [];
const proof: Record<string, unknown> = {};
const preview = process.env.CLASSIC_PREVIEW;
async function run(): Promise<void> {
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
    gameType: 'poker',
    settings: JSON.stringify({
      name: 'Classic Oklahoma proof',
      maxPlayers: 8,
      variation: 'oklahoma',
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
  const move = async (seat: number, intent: unknown) => {
    const before = row().stateJson;
    await people[seat].db.reducers.handleGameIntent({
      tableId: table.id,
      clientId: people[seat].clientId,
      intentPayload: JSON.stringify(intent),
    });
    await until(() => row().stateJson !== before, 'Action replicated');
  };
  await until(
    () =>
      [...db.gameSeat.iter()].filter((row) => row.tableId === table.id)
        .length === 8,
    'Eight seats replicated',
  );
  await move(0, { type: 'start_game' });
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
  const openView = async (spec: {
    name: string;
    width: number;
    height: number;
    person: number;
    mobile: boolean;
  }) => {
    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height },
      isMobile: spec.mobile,
      hasTouch: spec.mobile,
      recordVideo:
        process.env.CLASSIC_RECORD_VIDEO && spec.name === 'mobile'
          ? {
              dir: out + 'video/',
              size: { width: spec.width, height: spec.height },
            }
          : undefined,
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
          name: people[spec.person].name,
          clientId: people[spec.person].clientId,
          token: people[spec.person].token,
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
          ) + '\nwindow.__classicPokerEngine = engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('BROWSER ERROR', error.message);
    });
    await page.goto('http://127.0.0.1:5175/');
    console.log('OPEN', spec.name);
    try {
      await page.waitForFunction(
        (id) =>
          window.__classicPokerEngine?.currentScene.lastRow?.id === id &&
          window.__classicPokerEngine.currentScene.placed.length === 8,
        table.id,
      );
    } catch (error) {
      await page.screenshot({ path: out + 'failure-' + spec.name + '.png' });
      console.log(
        'LOAD STATE',
        await page.evaluate(() => ({
          scene: window.__classicPokerEngine?.currentScene.constructor.name,
          id: window.__classicPokerEngine?.currentScene.lastRow?.id,
          seats: window.__classicPokerEngine?.currentScene.placed?.length,
          path: location.pathname,
        })),
      );
      throw error;
    }
    views.push({ page, name: spec.name, person: spec.person });
  };
  for (const spec of [
    { name: 'desktop', width: 1440, height: 900, person: 0, mobile: false },
    { name: 'mobile', width: 844, height: 390, person: 1, mobile: true },
    { name: 'small-mobile', width: 667, height: 375, person: 0, mobile: true },
  ].filter((spec) => !preview || spec.name === preview))
    await openView(spec);
  const capture = async (stage: string) => {
    const expected = row().stateJson;
    await Promise.all(
      views.map(async (view) => {
        await view.page.waitForFunction((expected) => {
          const scene = window.__classicPokerEngine.currentScene;
          return (
            scene.lastRow?.stateJson === expected &&
            scene.pokerDriver.board.every((slot) => slot.flipMs === null) &&
            !scene.actors.some(
              (actor) => actor.name.endsWith('-flight') && !actor.isKilled(),
            )
          );
        }, expected);
        await view.page.waitForTimeout(100);
        if (!preview) {
          const data = await view.page.evaluate(() => {
            const scene = window.__classicPokerEngine.currentScene;
            const driver = scene.pokerDriver;
            const seat = scene.driverContext().meSeatIndex;
            const state = driver.state;
            const me = state.seats[String(seat)];
            return {
              controls: driver.buttons.filter(
                (button) => button.actor.graphics.isVisible,
              ).length,
              canAct:
                state.phase === 'play' &&
                state.step === 'bet' &&
                state.turnSeatIndex === seat &&
                !!me &&
                !me.folded &&
                !me.allIn &&
                !driver.stake,
              centralBanner: scene.actors.some(
                (actor) => actor.name === 'poker-message-label',
              ),
              boardRows: driver.board.map((slot) => slot.actor.pos.y),
            };
          });
          assert.equal(
            data.controls,
            data.canAct ? 5 : 0,
            `${stage}: controls belong only to the acting player`,
          );
          assert.equal(data.centralBanner, false);
          assert.ok(data.boardRows.every((y) => y === 350));
        }
        await view.page.screenshot({ path: `${out}${stage}-${view.name}.png` });
      }),
    );
    console.log('CAPTURED', stage);
  };
  const point = async (page: Page, x: number, y: number) => {
    const box = await page.locator('canvas').boundingBox();
    assert.ok(box);
    const scale = box.height / 540,
      gutter = (box.width / scale - 960) / 2;
    return { x: box.x + (x + gutter) * scale, y: box.y + y * scale };
  };
  const button = async (view: (typeof views)[number], target: string) => {
    const pos = await view.page.evaluate((target) => {
      const driver = window.__classicPokerEngine.currentScene.pokerDriver;
      const record = [...driver.buttons, ...driver.stakeButtons].find(
        (button) => button.target === target,
      );
      return {
        x: record.actor.pos.x + record.box.w / 2,
        y: record.actor.pos.y + record.box.h / 2,
      };
    }, target);
    const p = await point(view.page, pos.x, pos.y);
    if (view.name === 'desktop') await view.page.mouse.click(p.x, p.y);
    else await view.page.touchscreen.tap(p.x, p.y);
  };
  const advance = async () => {
    const current = state(),
      seat = current.turnSeatIndex;
    if (seat === null) {
      await delay(50);
      return;
    }
    if (current.step === 'discard')
      await move(seat, {
        type: 'discard',
        card: current.seats[String(seat)].hole[0],
      });
    else
      await move(seat, {
        type:
          current.street === 'preflop' && [2, 6].includes(seat)
            ? 'fold'
            : pokerCanCheck(current, seat)
              ? 'check'
              : 'call',
      });
  };
  if (process.env.CLASSIC_POT_MATRIX) {
    for (const amount of [800, 10000, 9999, 1000000395]) {
      for (const view of views) {
        const boxes = await view.page.evaluate((amount) => {
          const driver = window.__classicPokerEngine.currentScene.pokerDriver;
          driver.render({ ...driver.state, pot: amount }, driver.ctx);
          return window.__classicPokerEngine.currentScene.actors
            .filter((actor) => actor.name === 'pot-chip' && !actor.isKilled())
            .map((actor) => ({
              x: actor.pos.x,
              y: actor.pos.y,
              w: actor.graphics.current.width * actor.scale.x,
              h: actor.graphics.current.height * actor.scale.y,
              scale: actor.scale.x,
            }));
        }, amount);
        assert.ok(boxes.length > 0 && boxes.length <= 36);
        for (const chip of boxes) {
          assert.equal(chip.scale, 1.6);
          assert.ok(chip.x - chip.w / 2 >= 432);
          assert.ok(chip.x + chip.w / 2 <= 712);
          assert.ok(chip.y - chip.h / 2 >= 212);
          assert.ok(chip.y + chip.h / 2 <= 312);
        }
      }
      await capture(`visual-fixture-pot-${amount}`);
    }
    for (const view of views)
      await view.page.evaluate((actual) => {
        const driver = window.__classicPokerEngine.currentScene.pokerDriver;
        driver.render(JSON.parse(actual), driver.ctx);
      }, row().stateJson);
  }
  if (preview) {
    await capture('01-preflop');
    while (state().street === 'preflop') await advance();
    while (state().step === 'discard') await advance();
    await capture('03-flop-betting');
    while (state().turnSeatIndex !== views[0].person) await advance();
    await capture('04-your-turn');
    while (state().phase !== 'finished') await advance();
    await capture('07-showdown');
    console.log('CLASSIC SINGLE-VIEW PREVIEW CAPTURED');
    return;
  }
  await capture('01-preflop');
  for (const view of views) {
    const data = await view.page.evaluate(() => {
      const scene = window.__classicPokerEngine.currentScene;
      return {
        names: scene.actors
          .filter((actor) => actor.name === 'poker-player-name')
          .map((actor) => ({
            text: actor.graphics.current.text,
            width: actor.graphics.current.width,
            size: actor.graphics.current.font.size,
            family: actor.graphics.current.font.family,
          })),
        publicFaces: scene.actors.filter(
          (actor) => actor.name === 'showdown-card',
        ).length,
        localCards: scene.pokerDriver.cards.size,
        legacyHeaderHidden:
          !scene.leaveControl.graphics.isVisible &&
          scene.leaveControl.children.every(
            (child) => !child.graphics?.isVisible,
          ) &&
          scene.howToPlay.button.children.every(
            (child) => !child.graphics?.isVisible,
          ),
        outerFrame: scene.actors.some(
          (actor) =>
            actor.z === 1 &&
            actor.graphics.current?.width === 944 &&
            actor.graphics.current?.height === 524,
        ),
        labels: scene.actors
          .filter((actor) =>
            [
              'poker-player-name',
              'poker-player-stack',
              'poker-seat-status',
              'poker-pot-label',
              'poker-panel-heading',
              'poker-panel-detail',
            ].includes(actor.name),
          )
          .map((actor) => ({
            text: actor.graphics.current.text,
            xError:
              actor.graphics.offset.x +
              actor.graphics.current.width / 2 -
              actor.width / 2,
            yError:
              actor.graphics.offset.y +
              actor.graphics.current.height / 2 -
              actor.height / 2,
          })),
        handCenters: [...scene.pokerDriver.cards.values()].map(
          (card) =>
            card.actor.pos.y +
            card.actor.graphics.offset.y * card.actor.graphics.current.scale.y,
        ),
        potRight:
          scene.actors.find((actor) => actor.name === 'poker-pot-badge').pos.x +
          scene.actors.find((actor) => actor.name === 'poker-pot-badge').width,
        nameBadges: scene.actors.filter(
          (actor) => actor.name === 'poker-seat-badge',
        ).length,
        stackSizes: scene.actors
          .filter((actor) => actor.name === 'poker-player-stack')
          .map((actor) => actor.graphics.current.font.size),
        chipLeft: Math.min(
          ...scene.actors
            .filter((actor) => actor.name === 'pot-chip')
            .map(
              (actor) =>
                actor.pos.x -
                (actor.graphics.current.width * actor.scale.x) / 2,
            ),
        ),
        chips: scene.actors.filter((actor) => actor.name === 'pot-chip').length,
      };
    });
    assert.equal(data.names.length, 8);
    assert.equal(data.publicFaces, 0);
    assert.equal(data.localCards, view.person === 8 ? 0 : 4);
    assert.equal(data.legacyHeaderHidden, true);
    assert.equal(data.outerFrame, false);
    assert.equal(data.nameBadges, 0);
    assert.ok(data.stackSizes.every((size) => size >= 22));
    for (const label of data.labels) {
      assert.ok(
        Math.abs(label.xError) < 0.1,
        `${label.text} horizontal center`,
      );
      assert.ok(Math.abs(label.yError) < 0.1, `${label.text} vertical center`);
    }
    for (const center of data.handCenters)
      assert.ok(Math.abs(center - 484) < 0.1);
    assert.ok(
      data.chipLeft > data.potRight,
      'Pot label is beside the chip artwork',
    );
    assert.ok(
      data.chips > 0 && data.chips <= 36,
      'Pot uses bounded denomination piles',
    );
    if (view.name.includes('mobile')) {
      const box = await view.page.locator('canvas').boundingBox();
      assert.ok(box && box.x < 2, 'No duplicate fullscreen margin');
      const icon = await view.page
        .locator('[data-cardhouse-shell="fab"]')
        .boundingBox();
      assert.ok(icon);
      assert.ok(Math.abs(icon.height - (box.height * 40) / 540) < 0.1);
    }
    for (const name of data.names) {
      assert.ok(name.width <= 168);
      assert.ok(name.size >= 16);
      assert.ok(name.size <= 17);
      assert.equal(name.family, 'Chakra Petch');
    }
  }
  const phone = views.find((view) => view.name === 'mobile')!;
  const closeOverlay = async () => {
    const pos = await phone.page.evaluate(() => {
      const scene = window.__classicPokerEngine.currentScene;
      const actor = [
        ...scene.howToPlay.overlayActors,
        ...scene.tableChat.overlayActors,
      ].find((actor) =>
        actor.children?.some(
          (child) => child.graphics?.current?.text === 'Close',
        ),
      );
      return {
        x: actor.pos.x + actor.width / 2,
        y: actor.pos.y + actor.height / 2,
      };
    });
    const p = await point(phone.page, pos.x, pos.y);
    await phone.page.touchscreen.tap(p.x, p.y);
  };
  const canvas = await phone.page.locator('canvas').boundingBox();
  assert.ok(canvas);
  const gutter = (canvas.width / (canvas.height / 540) - 960) / 2;
  const helpPoint = await point(phone.page, 930 + gutter, 36);
  await phone.page.touchscreen.tap(helpPoint.x, helpPoint.y);
  await phone.page.waitForFunction(
    () => window.__classicPokerEngine.currentScene.howToPlay.isOpen,
  );
  await closeOverlay();
  const chatPoint = await point(phone.page, 260 - gutter, 36);
  await phone.page.touchscreen.tap(chatPoint.x, chatPoint.y);
  await phone.page.waitForFunction(
    () => window.__classicPokerEngine.currentScene.tableChat.isOpen,
  );
  await phone.page
    .getByRole('textbox', { name: 'Chat', exact: true })
    .fill('Classic table check');
  await phone.page
    .getByRole('textbox', { name: 'Chat', exact: true })
    .press('Enter');
  await until(
    () =>
      [...db.tableChatMessage.iter()].some(
        (row) => row.tableId === table.id && row.body === 'Classic table check',
      ),
    'Chat replicated',
  );
  await closeOverlay();
  proof.helpAndChatTouchControls = true;
  proof.mobileHeaderAndSafeMargins = true;
  proof.centeredLabelsAndHands = true;
  proof.outerFrameRemoved = true;
  proof.potLabelBesideChipStacks = true;
  proof.quietUnboxedNames = true;
  proof.turnOnlyActionsAndBottomBarStates = true;
  while (state().street === 'preflop') await advance();
  while (state().step === 'discard' && state().turnSeatIndex !== 1)
    await advance();
  assert.equal(state().seats['1'].hole.length, 4);
  await capture('02-flop-discard');
  const mobile = views.find((view) => view.name === 'mobile')!;
  const ownCard = await mobile.page.evaluate(
    () =>
      [
        ...window.__classicPokerEngine.currentScene.pokerDriver.cards.values(),
      ][0].home,
  );
  const tap = await point(mobile.page, ownCard.x, ownCard.y);
  const cdp = await mobile.page.context().newCDPSession(mobile.page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: tap.x, y: tap.y }],
  });
  await mobile.page.waitForTimeout(450);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await mobile.page.waitForTimeout(200);
  assert.equal(state().seats['1'].hole.length, 4, 'Long press only inspects');
  const selection = await mobile.page.evaluate(() =>
    window.getSelection()?.toString(),
  );
  assert.ok(!selection);
  await mobile.page.touchscreen.tap(tap.x, tap.y);
  await until(
    () => state().seats['1'].hole.length === 3,
    'Phone discarded exactly one card',
  );
  proof.touchDiscard = true;
  proof.longPressDoesNotDiscardOrSelect = true;
  while (state().step === 'discard') await advance();
  await capture('03-flop-betting');
  while (state().turnSeatIndex !== 1) await advance();
  const beforeBet = row().stateJson;
  await button(mobile, 'bet');
  await capture('04-bet-stepper');
  const slider = await mobile.page.evaluate(() => {
    const d = window.__classicPokerEngine.currentScene.pokerDriver;
    return { x: d.slider.pos.x, y: d.slider.pos.y };
  });
  const sliderPoint = await point(mobile.page, slider.x + 130, slider.y + 20);
  const sliderStart = await point(mobile.page, slider.x + 20, slider.y + 20);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [sliderStart],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [sliderPoint],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const selected = await mobile.page.evaluate(
    () => window.__classicPokerEngine.currentScene.pokerDriver.stake.amount,
  );
  assert.ok(selected > 20);
  await capture('04-slider-selected');
  await button(mobile, 'stake-confirm');
  await until(() => row().stateJson !== beforeBet, 'Phone bet replicated');
  await mobile.page.waitForFunction(() =>
    window.__classicPokerEngine.currentScene.actors.some(
      (actor) => actor.name === 'chip-bet-flight',
    ),
  );
  proof.touchBetSlider = true;
  proof.acceptedBetAnimates = true;
  proof.touchBetStepper = true;
  while (state().street === 'flop') await advance();
  await capture('05-turn-discard');
  while (state().step === 'discard') await advance();
  await capture('06-turn-two-cards');
  while (state().phase !== 'finished') await advance();
  await Promise.all(
    views.map((view) =>
      view.page.waitForFunction(
        () =>
          window.__classicPokerEngine.currentScene.pokerDriver.state?.phase ===
          'finished',
      ),
    ),
  );
  await capture('07-showdown');
  const result = state();
  assert.equal(
    result.order.filter((index) => !result.seats[String(index)].folded).length,
    6,
  );
  for (const view of views) {
    const data = await view.page.evaluate(() => {
      const scene = window.__classicPokerEngine.currentScene;
      return {
        state: JSON.stringify(scene.pokerDriver.state),
        publicCards: scene.actors
          .filter((actor) => actor.name === 'winner-focus-card')
          .map((actor) => ({
            seat: Number(
              [...actor.tags].find((tag) => tag.startsWith('seat-')).slice(5),
            ),
            scale: actor.scale.x * actor.graphics.current.scale.x,
          })),
        localCards: scene.pokerDriver.cards.size,
      };
    });
    assert.equal(data.localCards, 0);
    assert.equal(data.publicCards.length, 2);
    for (const card of data.publicCards) {
      assert.ok(![2, 6].includes(card.seat));
      assert.ok(result.winnerSeatIndexes.includes(card.seat));
      assert.ok(Math.abs(card.scale - 1.8) < 0.001);
    }
    assert.deepEqual(JSON.parse(data.state), result);
  }
  proof.players = 8;
  proof.uniqueIdentities = new Set(
    people.slice(0, 8).map((person) => person.db.identity!.toHexString()),
  ).size;
  proof.foldedHandsPrivate = true;
  proof.fourThreeTwoCardProgression = true;
  proof.allViewsSameState = true;
  for (const view of views) {
    const video = view.page.video();
    await view.page.context().close();
    if (video) await video.saveAs(out + 'mobile-motion.webm');
  }
  await until(
    () => state().phase === 'play',
    'Next deal before spectator review',
  );
  await openView({
    name: 'spectator',
    width: 1440,
    height: 900,
    person: 8,
    mobile: false,
  });
  const spectator = views[views.length - 1];
  const spectating = await spectator.page.evaluate(() => {
    const scene = window.__classicPokerEngine.currentScene;
    return {
      names: scene.actors.filter((actor) => actor.name === 'poker-player-name')
        .length,
      cards: scene.pokerDriver.cards.size,
      legacySpectatingLabel: scene.spectatingText.text,
      actions: scene.pokerDriver.buttons.filter(
        (button) => button.actor.graphics.isVisible,
      ).length,
    };
  });
  assert.equal(spectating.names, 8);
  assert.equal(spectating.cards, 0);
  assert.equal(spectating.actions, 0);
  assert.equal(spectating.legacySpectatingLabel, '');
  await spectator.page.screenshot({
    path: out + '11-spectator-eight-seats.png',
  });
  proof.eightPlayerSpectator = true;
  const watcherView = views.find((view) => view.person === 8)!;
  const leavePoint = await point(watcherView.page, 88, 36);
  await watcherView.page.mouse.click(leavePoint.x, leavePoint.y);
  await watcherView.page.waitForFunction(
    () => !window.__classicPokerEngine.currentScene.pokerDriver,
  );
  proof.spectatorLeaveViaHeader = true;
  assert.deepEqual(errors, []);
  proof.errors = errors;
  writeFileSync(out + 'proof.json', JSON.stringify(proof, null, 2));
  console.log('CLASSIC OKLAHOMA PROOF PASSED');
}
try {
  await run();
} finally {
  await browser.close();
  for (const person of people) person.db.disconnect();
}
