/** Exercise the actual host limit selector, then verify the replicated table setting. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { DbConnection } from '../client/src/module_bindings/index.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = fileURLToPath(
  new URL('../docs/classic-poker-evidence/no-limit-revision/', import.meta.url),
);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const proofs: unknown[] = [];
try {
  for (const mobile of [false, true]) {
    let token = '';
    const db = await new Promise<DbConnection>((resolve, reject) =>
      DbConnection.builder()
        .withUri('http://127.0.0.1:3000')
        .withDatabaseName('room-economy-test')
        .onConnect((db, _id, value) => {
          token = value;
          db.subscriptionBuilder()
            .onApplied(() => resolve(db))
            .onError(reject)
            .subscribeToAllTables();
        })
        .onConnectError((_ctx, error) => reject(error))
        .build(),
    );
    const clientId = crypto.randomUUID();
    await db.reducers.createLobby({ startingCoins: 10000 });
    const room = [...db.db.lobby.iter()].find(
      (row) => row.creatorIdentity === db.identity!.toHexString(),
    )!;
    await db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId,
      name: 'Limit host',
    });
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(
      ({ clientId, token, code }) => {
        localStorage.setItem('clientId', clientId);
        localStorage.setItem('stdbToken', token);
        localStorage.setItem(
          'lastRoom',
          JSON.stringify({ lobbyCode: code, name: 'Limit host', tableId: '' }),
        );
      },
      { clientId, token, code: room.code },
    );
    await context.route('**/src/main.ts*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body:
          (await response.text()).replace(
            /pixelRatio:\s*2/,
            'pixelRatio: 2, maxFps: 30',
          ) + '\nwindow.__limitEngine=engine;\n',
      });
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5175/');
    await page.waitForFunction(() =>
      window.__limitEngine?.currentScene.actors.some(
        (actor) => actor.graphics.current?.text === 'Tables',
      ),
    );
    const tap = async (x: number, y: number, right = false) => {
      const box = (await page.locator('canvas').boundingBox())!;
      const width = (box.width / box.height) * 540,
        gutter = (width - 960) / 2;
      await page.mouse.click(
        box.x + ((x + gutter + (right ? gutter : 0)) / width) * box.width,
        box.y + (y / 540) * box.height,
      );
      await page.waitForTimeout(200);
    };
    await tap(550, 106, true);
    await page
      .getByRole('textbox', { name: 'Table name (optional)', exact: true })
      .waitFor();
    await tap(mobile ? 224 : 312, mobile ? 140 : 228); // Previous wraps Bluff to Poker.
    if (mobile) {
      // Oklahoma defaults to pot-limit; choose no-limit independently.
      await tap(736, 340);
      await tap(736, 340);
    }
    await tap(mobile ? 324 : 375, mobile ? 480 : 374);
    await page
      .getByRole('textbox', { name: 'Minimum buy-in', exact: true })
      .waitFor();
    await tap(mobile ? 653 : 633, mobile ? 36 : 83); // Toggle betting limit in stakes header.
    await page.waitForTimeout(400);
    await page.screenshot({
      path:
        out +
        (mobile
          ? '13-mobile-no-limit-host-choice'
          : '12-desktop-pot-limit-host-choice') +
        '.png',
    });
    await tap(334, mobile ? 486 : 452);
    await page.waitForFunction(
      () => window.__limitEngine?.currentScene.lastRow?.gameType === 'poker',
    );
    const end = Date.now() + 5000;
    while (
      ![...db.db.gameTable.iter()].some((row) => row.lobbyId === room.id)
    ) {
      if (Date.now() > end) throw Error('Table creation not replicated');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const table = [...db.db.gameTable.iter()].find(
      (row) => row.lobbyId === room.id,
    )!;
    const state = JSON.parse(table.stateJson);
    assert.equal(state.limit, mobile ? 'no-limit' : 'pot-limit');
    assert.equal(state.variation, mobile ? 'oklahoma' : 'holdem');
    proofs.push({
      mobile,
      variation: state.variation,
      limit: state.limit,
      hostCreatedAndSeated: true,
    });
    await context.close();
    db.disconnect();
  }
  writeFileSync(out + 'host-choice.json', JSON.stringify(proofs, null, 2));
  console.log('HOST LIMIT SELECTOR PROOF PASSED');
} finally {
  await browser.close();
}
