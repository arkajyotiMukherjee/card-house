/** Running-app evidence for the approved shared prize-pool badge. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = fileURLToPath(
  new URL('../docs/prize-pool-evidence/', import.meta.url),
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

let people: Awaited<ReturnType<typeof connect>>[] = [];
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const errors: string[] = [];
const proofs: unknown[] = [];
try {
  const games = [
    ['president', 6],
    ['bluff', 6],
    ['go_fish', 6],
    ['crazy_eights', 7],
    ['rummy', 6],
    ['spades', 4],
    ['hearts', 4],
    ['president-large', 6],
  ] as const;
  for (const [name, count] of games) {
    people = await Promise.all(
      [
        'Ava Bennett',
        'Ben Harrison',
        'Chloe Martin',
        'Dev Sharma',
        'Ella Johnson',
        'Finn Walker',
        'Gia Williams',
      ].map(connect),
    );
    const host = people[0],
      db = host.db.db;
    await host.db.reducers.createLobby({ startingCoins: 1000000000 });
    const room = [...db.lobby.iter()].find(
      (r) => r.creatorIdentity === host.db.identity!.toHexString(),
    )!;
    for (const person of people)
      await person.db.reducers.joinLobby({
        lobbyCode: room.code,
        clientId: person.clientId,
        name: person.name,
      });
    const gameType = name.replace('-large', ''),
      fee = name.endsWith('-large') ? 999999000 : 20;
    const old = new Set([...db.gameTable.iter()].map((t) => t.id));
    await host.db.reducers.createGameTable({
      lobbyId: room.id,
      gameType,
      settings: JSON.stringify({
        name:
          gameType === 'president'
            ? 'Classic President'
            : gameType.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()),
        maxPlayers: count,
        entryFee: fee,
      }),
    });
    const table = [...db.gameTable.iter()].find(
      (t) => t.lobbyId === room.id && !old.has(t.id),
    )!;
    for (const person of people.slice(1, count))
      await person.db.reducers.joinTable({
        tableId: table.id,
        lobbyMemberId: `member_${room.id}_${person.clientId}`,
      });
    await host.db.reducers.handleGameIntent({
      tableId: table.id,
      clientId: host.clientId,
      intentPayload: JSON.stringify({ type: 'start_game' }),
    });
    const pool = fee * count;
    const inspect = async (page: Page) =>
      page.evaluate(() => {
        const s = window.__prizeEngine.currentScene,
          badge = s.prizeBadge;
        const amount = badge.children.find(
          (a) => a.name === 'prize-pool-amount',
        );
        const caption = badge.children.find(
          (a) => a.name === 'prize-pool-caption',
        );
        const text = amount.graphics.current;
        return {
          visible: badge.graphics.isVisible,
          amount: text.text,
          fontSize: text.font.size,
          inside:
            amount.pos.x >= 0 &&
            amount.pos.x + text.width <= badge.width &&
            amount.pos.y >= 0 &&
            amount.pos.y + text.height <= badge.height,
          caption: caption.graphics.current.text,
          headerPlayers: s.actors.filter(
            (a) =>
              !a.isKilled() &&
              a.pos.y < 65 &&
              typeof a.graphics.current?.text === 'string' &&
              /\d+ players/.test(a.graphics.current.text),
          ).length,
          badgeRight: badge.pos.x + badge.width,
          hudRight: s.hudPlate.graphics.isVisible
            ? s.hudPlate.pos.x + s.hudPlate.width
            : 0,
          hudY: s.hudPlate.pos.y,
        };
      });
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 844, height: 390 }
          : { width: 1440, height: 900 },
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
          clientId: host.clientId,
          token: host.token,
          code: room.code,
          tableId: table.id,
          name: host.name,
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
            ) + '\nwindow.__prizeEngine=engine;\n',
        });
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('http://127.0.0.1:5175/');
      await page.waitForFunction(
        ({ id, amount }) => {
          const s = window.__prizeEngine?.currentScene;
          return (
            s?.lastRow?.id === id &&
            !s.lastRow.waiting &&
            s.prizeBadge?.graphics.isVisible &&
            s.prizeBadge.children.some(
              (a) =>
                a.name === 'prize-pool-amount' &&
                a.graphics.current?.text === amount,
            )
          );
        },
        { id: table.id, amount: `${pool.toLocaleString('en-US')} chips` },
      );
      await delay(1200);
      const sizes = mobile ? ['mobile', 'small-mobile'] : ['desktop'];
      for (const size of sizes) {
        if (size === 'small-mobile') {
          await page.setViewportSize({ width: 667, height: 375 });
          await delay(700);
        }
        const data = await inspect(page);
        assert.equal(data.visible, true);
        assert.equal(data.amount, `${pool.toLocaleString('en-US')} chips`);
        assert.equal(data.caption, 'PRIZE POOL');
        assert.equal(data.inside, true);
        assert.equal(data.headerPlayers, 0);
        assert.ok(data.fontSize >= 16, 'Full amounts remain readable');
        if (!['president', 'bluff'].includes(gameType) && data.hudY > 0)
          assert.ok(
            data.hudRight < data.badgeRight - 220,
            'Phase HUD stays clear of prize badge',
          );
        await page.screenshot({ path: `${out}${name}-${size}.png` });
        proofs.push({ game: name, size, pool, ...data });
        console.log('CAPTURED', name, size, data.amount, data.fontSize);
      }
      await context.close();
    }
    // A voluntary departure cannot make committed entry fees disappear from the pool.
    if (name === 'president') {
      await people[1].db.reducers.leaveTable({
        tableId: table.id,
        lobbyMemberId: `member_${room.id}_${people[1].clientId}`,
      });
      await until(
        () =>
          [...db.tableFunding.iter()]
            .filter((r) => r.tableId === table.id)
            .reduce((sum, r) => sum + r.units, 0n) === BigInt(pool * 2),
        'Committed pool retained after leave',
      );
      proofs.push({ committedPoolAfterLeave: pool });
    }
    await host.db.reducers.closeLobby({ lobbyCode: room.code });
    for (const person of people) person.db.disconnect();
    people = [];
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'proof.json',
    JSON.stringify(
      {
        prizeGames: 7,
        sizes: ['1440×900', '844×390 touch', '667×375 touch'],
        checks: proofs,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('PRIZE BADGE PROOF PASSED');
} finally {
  await browser.close();
  for (const person of people) person.db.disconnect();
}
