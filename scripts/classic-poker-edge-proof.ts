/** Heads-up Oklahoma: all-in runout, zero-stack top-up, private fold win and safe exit. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import {
  pokerBetRange,
  pokerRaiseRange,
  pokerCanCheck,
} from '../src/shared/games/poker.ts';
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
const people = await Promise.all([
  connect('Ava Bennett'),
  connect('Ben Harrison'),
]);
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const errors: string[] = [];
try {
  const db = people[0].db.db;
  await people[0].db.reducers.createLobby({ startingCoins: 10000 });
  const room = [...db.lobby.iter()].find(
    (row) => row.creatorIdentity === people[0].db.identity!.toHexString(),
  )!;
  for (const person of people)
    await person.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: person.clientId,
      name: person.name,
    });
  await people[0].db.reducers.createGameTable({
    lobbyId: room.id,
    gameType: 'poker',
    settings: JSON.stringify({
      name: 'Classic heads-up proof',
      maxPlayers: 2,
      variation: 'oklahoma',
      limit: 'no-limit',
      smallBlind: 5,
      bigBlind: 10,
      minBuyIn: 40,
      maxBuyIn: 2000,
      buyIn: 400,
    }),
  });
  const table = [...db.gameTable.iter()].find(
    (row) => row.lobbyId === room.id,
  )!;
  await people[1].db.reducers.joinTable({
    tableId: table.id,
    lobbyMemberId: `member_${room.id}_${people[1].clientId}`,
    buyIn: 400,
  });
  const state = () => JSON.parse(db.gameTable.id.find(table.id)!.stateJson);
  const move = async (index: number, intent: unknown) => {
    const before = JSON.stringify(state());
    await people[index].db.reducers.handleGameIntent({
      tableId: table.id,
      clientId: people[index].clientId,
      intentPayload: JSON.stringify(intent),
    });
    await until(() => JSON.stringify(state()) !== before, 'Action replicated');
  };
  await move(0, { type: 'start_game' });
  const views = [];
  const mobileViews: boolean[] = [];
  for (const [index, person] of people.entries()) {
    const mobile =
      process.env.CLASSIC_ACTIVE_MOBILE === '1' ? index === 0 : index === 1;
    mobileViews.push(mobile);
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      ({ person, code, id }) => {
        localStorage.setItem('clientId', person.clientId);
        localStorage.setItem('stdbToken', person.token);
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, name: person.name, tableId: id }),
        );
      },
      {
        person: {
          clientId: person.clientId,
          token: person.token,
          name: person.name,
        },
        code: room.code,
        id: table.id,
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
          ) + '\nwindow.__classicPokerEngine=engine;\n',
      });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5175/');
    await page.waitForFunction(
      (id) => window.__classicPokerEngine?.currentScene.lastRow?.id === id,
      table.id,
    );
    views.push(page);
  }
  const capture = async (stage: string) =>
    Promise.all(
      views.map(async (page, index) => {
        await page.waitForFunction(() =>
          window.__classicPokerEngine.currentScene.pokerDriver.board.every(
            (slot) => slot.flipMs === null,
          ),
        );
        await page.waitForTimeout(250);
        await page.screenshot({
          path: `${out}${stage}-${mobileViews[index] ? 'mobile' : 'desktop'}.png`,
        });
      }),
    );
  const click = async (index: number, x: number, y: number) => {
    const page = views[index],
      box = await page.locator('canvas').boundingBox();
    assert.ok(box);
    const scale = box.height / 540,
      gutter = (box.width / scale - 960) / 2;
    if (mobileViews[index])
      await page.touchscreen.tap(
        box.x + (x + gutter) * scale,
        box.y + y * scale,
      );
    else
      await page.mouse.click(box.x + (x + gutter) * scale, box.y + y * scale);
  };
  const clickCaption = async (index: number, caption: string) => {
    await views[index].waitForFunction(
      (caption) =>
        window.__classicPokerEngine.currentScene.actors.some(
          (actor) =>
            actor.graphics.isVisible &&
            actor.pos.y >= 0 &&
            actor.pos.y < 540 &&
            actor.children?.some(
              (child) => child.graphics?.current?.text === caption,
            ),
        ),
      caption,
    );
    const pos = await views[index].evaluate((caption) => {
      const actor = window.__classicPokerEngine.currentScene.actors.find(
        (actor) =>
          actor.graphics.isVisible &&
          actor.pos.y >= 0 &&
          actor.pos.y < 540 &&
          actor.children?.some(
            (child) => child.graphics?.current?.text === caption,
          ),
      );
      return {
        x: actor.pos.x + actor.width / 2,
        y: actor.pos.y + actor.height / 2,
      };
    }, caption);
    await click(index, pos.x, pos.y);
  };
  let discarded = 0;
  let noLimitSlider = false;
  while (state().phase !== 'finished') {
    const current = state(),
      index = current.turnSeatIndex;
    if (index === null) {
      await delay(50);
      continue;
    }
    if (current.step === 'discard') {
      if (discarded === 0) {
        assert.equal(current.limit, 'no-limit');
        assert.ok(
          current.pot >= 800,
          'Called full stacks exceed the opening pot',
        );
        await capture('08-all-in-announced');
      }
      discarded++;
      await move(index, {
        type: 'discard',
        card: current.seats[String(index)].hole[0],
      });
      continue;
    }
    const range =
      current.currentBet > 0
        ? pokerRaiseRange(current, index)
        : pokerBetRange(current, index);
    if (!noLimitSlider && index === 0 && range) {
      await clickCaption(0, current.currentBet > 0 ? 'Raise' : 'Bet');
      await views[0].keyboard.press('End');
      await views[0].waitForFunction(
        (max) =>
          window.__classicPokerEngine.currentScene.pokerDriver.stake?.amount ===
          max,
        range.max,
      );
      const shown = await views[0].evaluate(() => {
        const driver = window.__classicPokerEngine.currentScene.pokerDriver;
        return {
          amount: driver.amount.value.graphics.current.text,
          label: driver.amount.range.graphics.current.text,
          size: driver.amount.range.graphics.current.font.size,
          chips: driver.previewChips.length,
        };
      });
      assert.equal(shown.amount, String(current.seats['0'].chips));
      assert.equal(shown.amount, '395');
      assert.equal(shown.label, 'Add chips');
      assert.ok(shown.size >= 17);
      assert.equal(
        shown.chips,
        8,
        'All 395 chips represented by 3 black, 3 green and 2 blue chips',
      );
      await capture('14-no-limit-slider');
      const beforeConfirm = JSON.stringify(state());
      await clickCaption(0, 'Raise');
      await until(
        () => JSON.stringify(state()) !== beforeConfirm,
        'UI all-in replicated',
      );
      assert.equal(
        state().seats['0'].chips,
        0,
        'Confirm spends exactly the remaining 395',
      );
      assert.equal(
        state().seats['0'].committed,
        400,
        'The posted 5-chip blind stays in the pot',
      );
      noLimitSlider = true;
      continue;
    }
    await move(
      index,
      range
        ? { type: current.currentBet > 0 ? 'raise' : 'bet', amount: range.max }
        : { type: pokerCanCheck(current, index) ? 'check' : 'call' },
    );
  }
  assert.equal(
    discarded,
    4,
    'Both players discard twice during the automatic all-in runout',
  );
  assert.equal(state().board.length, 5);
  assert.equal(state().end, 'showdown');
  await Promise.all(
    views.map((page) =>
      page.waitForFunction(
        () =>
          window.__classicPokerEngine.currentScene.pokerDriver.state?.phase ===
          'finished',
      ),
    ),
  );
  await capture('08-headsup-all-in');
  const result = state(),
    empty = result.order.find(
      (index) => result.seats[String(index)].chips === 0,
    );
  if (empty !== undefined) {
    await clickCaption(empty, 'Top up');
    const amount = views[empty].getByRole('textbox', {
      name: 'Additional chips',
      exact: true,
    });
    // Focus as a user would before replacing an existing numeric value.
    await amount.click();
    await amount.fill('4000');
    await amount.press('Enter');
    await views[empty].waitForFunction(() =>
      window.__classicPokerEngine.currentScene.actors.some(
        (actor) => actor.name === 'table-notice',
      ),
    );
    const notice = await views[empty].evaluate(() => {
      const actor = window.__classicPokerEngine.currentScene.actors.find(
        (actor) => actor.name === 'table-notice',
      );
      return {
        x: actor.pos.x,
        y: actor.pos.y,
        w: actor.width,
        h: actor.height,
      };
    });
    assert.ok(notice.x >= 556 && notice.y >= 436 && notice.y + notice.h <= 532);
    await capture('09-invalid-topup');
    await views[empty].waitForFunction(
      () =>
        !window.__classicPokerEngine.currentScene.actors.some(
          (actor) => actor.name === 'table-notice',
        ),
    );
    await clickCaption(empty, 'Top up');
    await amount.click();
    await amount.fill('40');
    assert.equal(await amount.inputValue(), '40');
    await amount.press('Enter');
    await until(
      () =>
        [...people[empty].db.db.tableFunding.iter()].some(
          (row) => row.tableId === table.id && row.units === 80n,
        ),
      'Top-up replicated',
    );
    assert.equal(
      Object.values(state().seats).reduce(
        (sum: number, row: { chips: number }) => sum + row.chips,
        0,
      ) + (state().phase === 'play' ? state().pot : 0),
      840,
    );
    await capture('09-top-up-shared');
  }
  await until(
    () => state().phase === 'play',
    'Next hand starts from shared countdown',
  );
  const current = state(),
    index = current.turnSeatIndex;
  await clickCaption(index, 'Fold');
  await until(() => state().phase === 'finished', 'Fold ends the hand');
  assert.equal(state().end, 'fold');
  assert.equal(state().board.length, 5);
  await Promise.all(
    views.map((page) =>
      page.waitForFunction(
        () =>
          window.__classicPokerEngine.currentScene.pokerDriver.state?.phase ===
          'finished',
      ),
    ),
  );
  await capture('10-uncalled-private');
  for (const page of views)
    assert.equal(
      await page.evaluate(
        () =>
          window.__classicPokerEngine.currentScene.actors.filter(
            (actor) => actor.name === 'showdown-card',
          ).length,
      ),
      0,
    );
  await clickCaption(1, 'Leave Table');
  await views[1].waitForFunction(
    () => !window.__classicPokerEngine.currentScene.pokerDriver,
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'edge-proof.json',
    JSON.stringify(
      {
        players: 2,
        noLimitFullStacksBeyondPot: true,
        noLimitSliderAllIn: noLimitSlider,
        additionalChipsShownAndSpent: 395,
        mobileActing: mobileViews[0],
        allInRunsOutWithoutChecks: true,
        discardActions: discarded,
        zeroStackTopUp: empty !== undefined,
        errorContainedInPersonalBar: empty !== undefined,
        uncalledHandPrivate: true,
        remainingBoardRevealed: true,
        leaveViaHeader: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('CLASSIC HEADS-UP PROOF PASSED');
} finally {
  await browser.close();
  for (const person of people) person.db.disconnect();
}
