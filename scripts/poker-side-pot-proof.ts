/** Unequal all-ins through real server reducers; bounded pot overview and eligibility. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import {
  pokerRaiseRange,
  pokerBetRange,
  pokerPotWinners,
  type PokerState,
} from '../src/shared/games/poker.ts';
import { pokerPotEntries } from '../client/src/poker-pots.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const preview = process.env.POKER_POT_PREVIEW === '1';
const out = fileURLToPath(
  new URL(
    '../docs/poker-side-pot-evidence/' + (preview ? 'preview/' : ''),
    import.meta.url,
  ),
);
mkdirSync(out, { recursive: true });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
let people: Awaited<ReturnType<typeof connect>>[] = [];
let roomCode: string | undefined;
const errors: string[] = [];
const proofs: unknown[] = [];
let context: BrowserContext | undefined, page: Page | undefined;
try {
  for (const count of preview ? [4] : [4, 8]) {
    people = await Promise.all(
      [
        'Ava Bennett',
        'Ben Harrison',
        'Chloe Martin',
        'Dev Sharma',
        'Ella Johnson',
        'Finn Walker',
        'Gia Williams',
        'Hugo Ramirez',
      ]
        .slice(0, count)
        .map(connect),
    );
    const host = people[0],
      db = host.db.db;
    await host.db.reducers.createLobby({ startingCoins: 10000 });
    const room = [...db.lobby.iter()].find(
      (row) => row.creatorIdentity === host.db.identity!.toHexString(),
    )!;
    roomCode = room.code;
    for (const person of people)
      await person.db.reducers.joinLobby({
        lobbyCode: room.code,
        clientId: person.clientId,
        name: person.name,
      });
    const buyIns =
      count === 4
        ? [100, 200, 300, 300]
        : [100, 200, 300, 400, 500, 600, 700, 800];
    await host.db.reducers.createGameTable({
      lobbyId: room.id,
      gameType: 'poker',
      settings: JSON.stringify({
        name: 'Side pot proof',
        variation: 'oklahoma',
        limit: 'no-limit',
        maxPlayers: count,
        smallBlind: 5,
        bigBlind: 10,
        minBuyIn: 40,
        maxBuyIn: 2000,
        buyIn: buyIns[0],
      }),
    });
    const table = [...db.gameTable.iter()].find(
      (row) => row.lobbyId === room.id,
    )!;
    for (const [index, person] of people.entries())
      if (index)
        await person.db.reducers.joinTable({
          tableId: table.id,
          lobbyMemberId: `member_${room.id}_${person.clientId}`,
          buyIn: buyIns[index],
        });
    const state = (): PokerState =>
      JSON.parse(db.gameTable.id.find(table.id)!.stateJson);
    const move = async (seat: number, intent: unknown): Promise<void> => {
      const before = JSON.stringify(state());
      await people[seat].db.reducers.handleGameIntent({
        tableId: table.id,
        clientId: people[seat].clientId,
        intentPayload: JSON.stringify(intent),
      });
      await until(
        () => JSON.stringify(state()) !== before,
        'accepted move replicated',
      );
    };
    await move(0, { type: 'start_game' });
    const open = async (mobile: boolean, personIndex = 0): Promise<void> => {
      await context?.close();
      const person = people[personIndex];
      context = await browser.newContext({
        viewport: mobile
          ? { width: 844, height: 390 }
          : { width: 1440, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      await context.addInitScript(
        ({ id, token, code, tableId, name }) => {
          localStorage.setItem('clientId', id);
          localStorage.setItem('stdbToken', token);
          localStorage.setItem(
            'lastRoom',
            JSON.stringify({ lobbyCode: code, tableId, name }),
          );
        },
        {
          id: person.clientId,
          token: person.token,
          code: room.code,
          tableId: table.id,
          name: person.name,
        },
      );
      await context.route('**/@vite/client', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        await route.fulfill({
          response,
          body: source.match(/^import[^;]+;/)?.[0] ?? '',
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
            ) + '\nwindow.__sidePotEngine=engine;\n',
        });
      });
      page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('http://127.0.0.1:5175/');
      await page.waitForFunction(
        (id) =>
          window.__sidePotEngine?.currentScene?.lastRow?.id === id &&
          window.__sidePotEngine.currentScene.pokerDriver.state?.phase ===
            'play',
        table.id,
      );
      await delay(600);
    };
    const sync = async (): Promise<void> => {
      await page!.waitForFunction(
        (actual) =>
          JSON.stringify(
            window.__sidePotEngine?.currentScene?.pokerDriver?.state,
          ) === actual,
        JSON.stringify(state()),
      );
    };
    const capture = async (stage: string): Promise<void> => {
      await sync();
      await delay(600);
      await page!.screenshot({ path: `${out}${count}-${stage}.png` });
      console.log('CAPTURED', count, stage);
    };
    const coords = async (x: number, y: number) => {
      const b = (await page!.locator('canvas').boundingBox())!,
        scale = b.height / 540,
        gutter = (b.width / scale - 960) / 2;
      return { x: b.x + (x + gutter) * scale, y: b.y + y * scale };
    };
    const tap = async (name: string, mobile = true): Promise<void> => {
      const pos = await page!.evaluate((name) => {
        const a = window.__sidePotEngine.currentScene.actors.find(
          (a) => a.name === name && !a.isKilled() && a.graphics.isVisible,
        );
        if (!a) throw Error('Actor missing ' + name);
        return {
          x: a.pos.x + (a.anchor.x === 0 ? a.width / 2 : 0),
          y: a.pos.y + (a.anchor.y === 0 ? a.height / 2 : 0),
        };
      }, name);
      const point = await coords(pos.x, pos.y);
      if (mobile) await page!.touchscreen.tap(point.x, point.y);
      else await page!.mouse.click(point.x, point.y);
      await delay(180);
    };
    const shove = async (): Promise<void> => {
      const s = state(),
        seat = s.turnSeatIndex!,
        range = pokerRaiseRange(s, seat) ?? pokerBetRange(s, seat);
      await move(
        seat,
        range
          ? { type: s.currentBet > 0 ? 'raise' : 'bet', amount: range.max }
          : { type: 'call' },
      );
    };
    while (state().step === 'bet' && state().phase === 'play') {
      const active = state().order.filter(
        (seat) =>
          !state().seats[String(seat)].allIn &&
          !state().seats[String(seat)].folded,
      );
      const pending = pokerPotEntries(state()).find(
        (p) => p.pending && p.title === 'Awaiting calls',
      );
      if (count === 4 && active.length === 1 && pending) {
        await open(true, active[0]);
        await capture('pending-call-mobile');
        proofs.push({
          pending: true,
          pot: state().pot,
          entries: pokerPotEntries(state()),
        });
        // The final actual call comes from the second browser player's canvas action.
        const control = await page!.evaluate(() => {
          const d = window.__sidePotEngine.currentScene.pokerDriver;
          const b = d.buttons.find((b) => b.target === 'call');
          return {
            x: b.actor.pos.x + b.actor.width / 2,
            y: b.actor.pos.y + b.actor.height / 2,
          };
        });
        const point = await coords(control.x, control.y);
        await page!.touchscreen.tap(point.x, point.y);
        await until(
          () => state().seats[String(active[0])].allIn,
          'canvas final call accepted',
        );
        break;
      }
      await shove();
    }
    await until(
      () => state().step === 'discard',
      'Oklahoma discard holds the all-in snapshot for review',
    );
    const entries = pokerPotEntries(state());
    assert.equal(entries.filter((e) => !e.pending).length, count === 4 ? 3 : 7);
    assert.equal(
      entries.reduce((n, e) => n + e.amount, 0),
      state().pot,
    );
    const check = async () => {
      const value = await page!.evaluate(() => {
        const s = window.__sidePotEngine.currentScene;
        return {
          sums: s.pokerDriver.state.pots.map((p) => p.amount),
          captions: s.actors
            .filter((a) => a.name === 'poker-pot-caption' && !a.isKilled())
            .map((a) => a.graphics.current.text),
          amounts: s.actors
            .filter((a) => a.name === 'poker-pot-amount' && !a.isKilled())
            .map((a) => a.graphics.current.text),
          board: [...s.pokerDriver.board.values()].map((r) => r.actor.pos.y),
        };
      });
      assert.ok(value.captions.includes('Main pot'));
      assert.ok(value.amounts.length <= 3);
      return value;
    };
    await open(true, 1);
    await check();
    await capture('three-pots-mobile');
    if (preview) break;
    await page!.setViewportSize({ width: 667, height: 375 });
    await delay(700);
    await capture('pots-small-mobile');
    await tap('poker-pot-1');
    const details = await page!.evaluate(() =>
      window.__sidePotEngine.currentScene.actors
        .filter(
          (a) => a.name === 'poker-pot-eligible-player-name' && !a.isKilled(),
        )
        .map((a) => a.graphics.current.text),
    );
    assert.equal(details.length, entries[1].eligible.length);
    await capture('side-pot-eligibility-small-mobile');
    await tap('poker-pot-details-close');
    assert.equal(
      await page!.evaluate(
        () =>
          window.__sidePotEngine.currentScene.pokerDriver.tableUi
            .isPotDetailsOpen,
      ),
      false,
    );
    if (count === 8) {
      const seen = new Set<string>();
      for (let n = 0; n < 4; n++) {
        const captions = await page!.evaluate(() =>
          window.__sidePotEngine.currentScene.actors
            .filter((a) => a.name === 'poker-pot-caption' && !a.isKilled())
            .map((a) => a.graphics.current.text),
        );
        captions.forEach((c) => seen.add(c));
        await capture(`pot-page-${n + 1}-small-mobile`);
        const next = await page!.evaluate(() => {
          const a = window.__sidePotEngine.currentScene.actors.find(
            (a) => a.name === 'classic-›' && !a.isKilled(),
          );
          return { x: a.pos.x + a.width / 2, y: a.pos.y + a.height / 2 };
        });
        const p = await coords(next.x, next.y);
        await page!.touchscreen.tap(p.x, p.y);
        await delay(250);
      }
      assert.equal(
        seen.size,
        8,
        'all seven contested layers and uncalled amount reachable',
      );
    }
    await open(false, 0);
    await check();
    if (count === 4) {
      const metrics = await page!.evaluate(async () => {
        const { uiText } = await import('/src/ui-text.ts');
        const { classicText } = await import('/src/classic-table-design.ts');
        const { ClassicTableUi } = await import('/src/classic-table-ui.ts');
        const { pokerPotPage } = await import('/src/poker-pots.ts');
        const ink = classicText('').color;
        const captions = [9999, 10000, 99999, 100000, 9999999, 8000000000].map(
          (amount) => {
            const entry = {
              amount,
              title: 'Side pot 6',
              key: 'pot-6',
              eligible: [],
              winners: [],
              pending: false,
            };
            const columns = pokerPotPage([entry, entry, entry], 0).columns;
            const available = (472 - (columns - 1) * 8) / columns - 8;
            return {
              amount,
              columns,
              available,
              width: uiText(`Side pot 6 · ${amount.toLocaleString()}`, 16, ink)
                .width,
            };
          },
        );
        const ui = new ClassicTableUi({
          scene: window.__sidePotEngine.currentScene,
        });
        const name = ui.text(
          { x: 0, y: -1000, w: 188, h: 22 },
          'Alexandria Montgomery-Williams',
          18,
          undefined,
          undefined,
          false,
          'poker-pot-eligible-player-name',
        );
        const graphic = name.graphics.current;
        const result = {
          captions,
          name: {
            width: graphic.width,
            height: graphic.height,
            text: graphic.text,
            size: graphic.font.size,
          },
        };
        ui.clear();
        return result;
      });
      assert.ok(
        metrics.captions.every((row) => row.width <= row.available),
        'Exact finished captions fit at column threshold and large amounts',
      );
      assert.ok(
        metrics.name.width <= 188 &&
          metrics.name.height <= 22 &&
          !metrics.name.text.includes('\n'),
      );
      proofs.push({ textBounds: metrics });
    }

    await capture('pots-desktop');
    // Complete both mandatory discard rounds through actual reducer actions.
    for (let n = 0; state().phase === 'play' && n < 40; n++) {
      const s = state();
      if (s.step === 'discard')
        await move(s.turnSeatIndex!, {
          type: 'discard',
          card: s.seats[String(s.turnSeatIndex)].hole[0],
        });
      else await delay(100);
    }
    await until(() => state().phase === 'finished', 'showdown');
    await capture('per-pot-results-desktop');
    await page!.setViewportSize({ width: 667, height: 375 });
    await delay(350);
    await capture('per-pot-results-small-viewport');
    const final = state();
    assert.equal(
      final.pots.reduce((n, p) => n + p.amount, 0),
      final.pot,
    );
    assert.ok(
      final.pots.every((p) =>
        p.eligible.every((seat) => !final.seats[String(seat)].folded),
      ),
    );
    proofs.push({
      players: count,
      entries,
      finalPot: final.pot,
      settledPots: final.pots.map((p) => ({
        ...p,
        winners: pokerPotWinners(final, p),
      })),
      conserved:
        Object.values(final.seats).reduce((n, s) => n + s.chips, 0) ===
        buyIns.reduce((a, b) => a + b, 0),
    });
    await context!.close();
    context = undefined;
    await host.db.reducers.closeLobby({ lobbyCode: room.code });
    for (const person of people) person.db.disconnect();
    people = [];
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'proof.json',
    JSON.stringify({ proofs, errors }, null, 2),
  );
  console.log('SIDE POT PROOF PASSED');
} finally {
  if (roomCode && people[0])
    await people[0].db.reducers
      .closeLobby({ lobbyCode: roomCode })
      .catch(() => {});
  await context?.close();
  await browser.close();
  for (const person of people) person.db.disconnect();
}
