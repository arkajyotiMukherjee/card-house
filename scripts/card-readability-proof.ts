/** Two identities and two real browser views against the isolated local module. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import { pokerCanCheck } from '../src/shared/games/poker.ts';
import { strategyFor } from '../src/shared/games/bots/registry.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const output = fileURLToPath(
  new URL('../docs/lobby-ux-evidence/', import.meta.url),
);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw Error(label);
    await delay(20);
  }
}
async function connect(name: string) {
  let token = '';
  const db = await new Promise<DbConnection>((resolve, reject) =>
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
      .build(),
  );
  return { db, token, clientId: crypto.randomUUID(), name };
}
const people = await Promise.all([connect('Card Host'), connect('Card Guest')]);
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const views = [];
const errors: string[] = [];
const proof: Record<string, unknown> = {};
try {
  const db = people[0].db.db;
  const before = new Set([...db.lobby.iter()].map((row) => row.id));
  await people[0].db.reducers.createLobby({ startingCoins: 10000 });
  const room = [...db.lobby.iter()].find(
    (row) =>
      !before.has(row.id) &&
      row.creatorIdentity === people[0].db.identity!.toHexString(),
  )!;
  const member = (index: number) =>
    `member_${room.id}_${people[index].clientId}`;
  for (const person of people)
    await person.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: person.clientId,
      name: person.name,
    });
  const row = (id: string) => db.gameTable.id.find(id)!;
  const state = (id: string) => JSON.parse(row(id).stateJson);
  const intent = async (id: string, index: number, move: unknown) => {
    const previous = row(id).stateJson;
    await people[index].db.reducers.handleGameIntent({
      tableId: id,
      clientId: people[index].clientId,
      intentPayload: JSON.stringify(move),
    });
    await until(() => row(id).stateJson !== previous, 'Action replicated');
  };
  const create = async (gameType: string) => {
    const old = new Set([...db.gameTable.iter()].map((row) => row.id));
    await people[0].db.reducers.createGameTable({
      lobbyId: room.id,
      gameType,
      settings: JSON.stringify({
        name: 'Card sizing',
        maxPlayers: 5,
        ...(gameType === 'poker' ? { variation: 'omaha' } : {}),
      }),
    });
    const id = [...db.gameTable.iter()].find(
      (row) =>
        !old.has(row.id) &&
        row.lobbyId === room.id &&
        row.hostMemberId === member(0),
    )!.id;
    await people[1].db.reducers.joinTable({
      tableId: id,
      lobbyMemberId: member(1),
    });
    await intent(id, 0, { type: 'start_game' });
    return id;
  };
  const open = async (id: string) => {
    for (const [index, person] of people.entries()) {
      let page = views[index];
      if (!page) {
        const context = await browser.newContext({
          viewport: index
            ? { width: 844, height: 390 }
            : { width: 1440, height: 900 },
          isMobile: Boolean(index),
          hasTouch: Boolean(index),
        });
        await context.addInitScript(
          ({ person }) => {
            if (localStorage.getItem('clientId')) return;
            localStorage.setItem('clientId', person.clientId);
            localStorage.setItem('stdbToken', person.token);
          },
          { person: { clientId: person.clientId, token: person.token } },
        );
        await context.route('**/src/main.ts*', async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            body:
              (await response.text()) +
              '\nwindow.__lobbyProofEngine = engine;\n',
          });
        });
        page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('http://127.0.0.1:5175');
        views.push(page);
      }
      await page.evaluate(
        ({ code, name, tableId }) =>
          localStorage.setItem(
            'lastRoom',
            JSON.stringify({ lobbyCode: code, name, tableId }),
          ),
        { code: room.code, name: person.name, tableId: id },
      );
      await page.goto('http://127.0.0.1:5175/');
      await page.waitForFunction(
        (id) => window.__lobbyProofEngine?.currentScene.lastRow?.id === id,
        id,
      );
    }
  };
  const capture = async (name: string) => {
    await Promise.all(
      views.map(async (page, index) => {
        await page.waitForTimeout(600);
        await page.screenshot({
          path:
            output +
            name.replace('VIEW', index ? 'mobile' : 'desktop') +
            '.png',
        });
      }),
    );
  };
  const poker = await create('poker');
  while (state(poker).board.length < 3) {
    const current = state(poker);
    if (current.turnSeatIndex === null) {
      await delay(80);
      continue;
    }
    await intent(poker, current.turnSeatIndex, {
      type: pokerCanCheck(current, current.turnSeatIndex) ? 'check' : 'call',
    });
  }
  await open(poker);
  await capture('41-VIEW-personal-bottom-band');
  for (const size of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    const page = views[1];
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector('canvas').getBoundingClientRect();
      const fullscreen = document
        .querySelector('[data-cardhouse-shell="fab"]')
        .getBoundingClientRect();
      return {
        fullscreenHeight: fullscreen.height,
        leaveHeight: (44 * canvas.height) / 540,
        fullscreenTop: fullscreen.top,
        leaveTop: canvas.top + (16 * canvas.height) / 540,
      };
    });
    assert.ok(Math.abs(geometry.fullscreenHeight - geometry.leaveHeight) < 0.1);
    assert.ok(Math.abs(geometry.fullscreenTop - geometry.leaveTop) < 0.1);
    proof[`${size.width}-fullscreen-alignment`] = geometry;
  }
  await views[1].setViewportSize({ width: 844, height: 390 });
  while (state(poker).phase !== 'finished') {
    const current = state(poker);
    if (current.turnSeatIndex === null) {
      await delay(80);
      continue;
    }
    if (current.step === 'discard')
      await intent(poker, current.turnSeatIndex, {
        type: 'discard',
        cardId: current.seats[String(current.turnSeatIndex)].hole[0],
      });
    else
      await intent(poker, current.turnSeatIndex, {
        type: pokerCanCheck(current, current.turnSeatIndex) ? 'check' : 'call',
      });
  }
  for (const [index, page] of views.entries()) {
    await page.waitForFunction(
      () =>
        window.__lobbyProofEngine.currentScene.pokerDriver.state?.phase ===
        'finished',
    );
    await page.waitForTimeout(150);
    const sizes = await page.evaluate(() => {
      const scene = window.__lobbyProofEngine.currentScene;
      const records = [...scene.pokerDriver.cards.values()];
      const own = records
        .filter((card) => card.faceUp)
        .map((card) => ({
          self: card.personal,
          scale: card.actor.scale.x * card.actor.graphics.current.scale.x,
          rotation: card.actor.rotation,
        }));
      const review = scene.actors
        .filter((actor) => actor.name === 'showdown-card')
        .map((actor) => ({
          scale: actor.scale.x * actor.graphics.current.scale.x,
          rotation: actor.rotation,
        }));
      return { own, review };
    });
    for (const card of [...sizes.own, ...sizes.review])
      assert.ok(Math.abs(card.scale - (index ? 1.35 : 1.1)) < 0.001);
    assert.ok(sizes.own.every((card) => card.self));
    assert.equal(sizes.review.length, 4);
    assert.ok(sizes.review.every((card) => Math.abs(card.rotation) < 0.01));
    proof[index ? 'mobile-showdown-scales' : 'desktop-showdown-scales'] = sizes;
  }
  await capture('42-VIEW-showdown-review');
  for (let index = 0; index < 2; index++)
    await people[index].db.reducers.leaveTable({
      tableId: poker,
      lobbyMemberId: member(index),
    });
  for (const gameType of ['blackjack', 'rummy', 'bluff']) {
    const id = await create(gameType);
    await open(id);
    const strategy = strategyFor(gameType)!;
    for (let turns = 0; state(id).phase !== 'finished'; turns++) {
      assert.ok(turns < 3000, 'Game completes');
      const current = state(id),
        index = strategy.actingSeats(current)[0];
      if (index === undefined) {
        await delay(30);
        continue;
      }
      await intent(id, index, strategy.choose(current, index));
    }
    for (const page of views)
      await page.waitForFunction((id) => {
        const scene = window.__lobbyProofEngine.currentScene;
        return (
          scene.lastRow.id === id &&
          JSON.parse(scene.lastRow.stateJson).phase === 'finished'
        );
      }, id);
    await capture(`43-VIEW-${gameType}-result`);
    for (const [index, page] of views.entries()) {
      const result = await page.evaluate((gameType) => {
        const scene = window.__lobbyProofEngine.currentScene;
        const driver =
          gameType === 'blackjack'
            ? scene.blackjackDriver
            : gameType === 'rummy'
              ? scene.rummyDriver
              : scene.bluffDriver;
        const cards =
          gameType === 'blackjack'
            ? [...driver.cards.values()]
                .filter((card) => card.faceUp)
                .map((card) => card.actor)
            : [...driver.backs.values()];
        return cards.map((actor) => ({
          scale: actor.scale.x * actor.graphics.current.scale.x,
          image: actor.graphics.current.image?.path,
        }));
      }, gameType);
      for (const card of result) {
        if (gameType === 'blackjack')
          assert.ok(Math.abs(card.scale - (index ? 1.35 : 1.1)) < 0.001);
        else assert.match(card.image, /card-back-/);
      }
      proof[`${gameType}-${index ? 'mobile' : 'desktop'}-result-cards`] =
        result;
    }
    proof[gameType + '-result-replicated'] = true;
    for (let index = 0; index < 2; index++)
      await people[index].db.reducers.leaveTable({
        tableId: id,
        lobbyMemberId: member(index),
      });
  }
  assert.deepEqual(errors, []);
  proof.errors = errors;
  writeFileSync(
    output + 'card-readability-current-proof.json',
    JSON.stringify(proof, null, 2),
  );
  console.log('CARD READABILITY PROOF PASSED');
} finally {
  await browser.close();
  for (const person of people) person.db.disconnect();
}
