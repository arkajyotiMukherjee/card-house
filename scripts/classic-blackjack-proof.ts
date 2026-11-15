/** Real five-player Blackjack wagers, splits and dealer privacy on the classic canvas. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import {
  blackjackRules,
  blackjackTotal,
  readBlackjackState,
  type BlackjackState,
  type BlackjackIntent,
} from '../src/shared/games/blackjack.ts';
import type { GameSeat, GameTable } from '../src/shared/games/game-rules.ts';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const out = fileURLToPath(
  new URL('../docs/classic-blackjack-evidence/', import.meta.url),
);
mkdirSync(out, { recursive: true });
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string): Promise<void> {
  const end = Date.now() + 30000;
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
      .onConnectError((_c, error) => reject(error))
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
    'Alexandra Montgomery',
  ].map(connect),
);
const host = people[0],
  db = host.db.db;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
  context: BrowserContext | undefined,
  page: Page | undefined,
  replicaContext: BrowserContext | undefined,
  replicaPage: Page | undefined;
let roomCode: string | undefined;
const errors: string[] = [],
  events: string[] = [],
  proofs: unknown[] = [];
const fast = process.env.BLACKJACK_FAST === '1';
const log = (...parts: unknown[]): void => {
  const line = parts.map(String).join(' ');
  events.push(line);
  console.log(line);
};
const mockSeat = (seatIndex: number): GameSeat => ({
  id: `proof${seatIndex}`,
  tableId: 'proof',
  lobbyMemberId: `proof${seatIndex}`,
  seatIndex,
  chips: 1000,
  joinedAt: 0,
  seatState: 'active',
});
const apply = (s: BlackjackState, intent: BlackjackIntent): BlackjackState =>
  blackjackRules.applyIntent(s, intent, {
    seat: mockSeat(s.turnSeatIndex!),
    now: 0,
  });
const legal = (s: BlackjackState, intent: BlackjackIntent): boolean => {
  try {
    apply(s, intent);
    return true;
  } catch {
    return false;
  }
};
type Planned = { seat: number; intent: BlackjackIntent };
function plan(
  initial: BlackjackState,
  kind: 'split' | 'insurance',
): { moves: Planned[]; seat: number } | null {
  let s = initial;
  const moves: Planned[] = [];
  while (s.phase === 'play' && s.step === 'bet') {
    const intent = { type: 'bet', amount: 25 } as const;
    moves.push({ seat: s.turnSeatIndex!, intent });
    s = apply(s, intent);
  }
  if (kind === 'insurance') {
    if (s.step !== 'insurance') return null;
    const seat = Object.entries(s.seats).find(
      ([, row]) =>
        row.hands.length === 1 && blackjackTotal(row.hands[0].cards) === 21,
    )?.[0];
    return seat === undefined ? null : { moves, seat: Number(seat) };
  }
  for (let n = 0; s.phase === 'play' && n < 100; n++) {
    const seat = s.turnSeatIndex!;
    const intent: BlackjackIntent =
      s.step === 'insurance'
        ? { type: 'insurance', take: false }
        : legal(s, { type: 'split' })
          ? { type: 'split' }
          : { type: 'stand' };
    moves.push({ seat, intent });
    s = apply(s, intent);
    if (s.seats[String(seat)].hands.length === 4) return { moves, seat };
  }
  return null;
}
try {
  await host.db.reducers.createLobby({ startingCoins: 100000 });
  const room = [...db.lobby.iter()].find(
    (r) => r.creatorIdentity === host.db.identity!.toHexString(),
  )!;
  roomCode = room.code;
  for (const person of people)
    await person.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: person.clientId,
      name: person.name,
    });
  let gate = false;
  for (const kind of (['split', 'insurance'] as const).filter(
    (kind) =>
      !process.env.BLACKJACK_CASE || process.env.BLACKJACK_CASE === kind,
  )) {
    let selected: ReturnType<typeof plan> = null;
    let table: typeof db.gameTable extends never
      ? never
      : ReturnType<typeof db.gameTable.id.find>;
    for (let attempt = 0; attempt < 350; attempt++) {
      const old = new Set([...db.gameTable.iter()].map((t) => t.id));
      await host.db.reducers.createGameTable({
        lobbyId: room.id,
        gameType: 'blackjack',
        settings: JSON.stringify({
          name: 'Classic Blackjack',
          maxPlayers: 5,
          minBet: 10,
          maxBet: 50,
          minBuyIn: 200,
          maxBuyIn: 2000,
          buyIn: 1000,
        }),
      });
      table = [...db.gameTable.iter()].find(
        (t) => t.lobbyId === room.id && !old.has(t.id),
      )!;
      const probe: GameTable = {
        id: table.id,
        lobbyId: room.id,
        gameType: 'blackjack',
        name: table.name,
        status: 'in_progress',
        minPlayers: 1,
        maxPlayers: 5,
        stateJson: table.stateJson,
        createdAt: 0,
        economy: JSON.parse(table.economyJson),
      };
      selected = plan(
        blackjackRules.initialState(
          Array.from({ length: 5 }, (_, i) => mockSeat(i)),
          probe,
        ),
        kind,
      );
      if (selected) {
        log('FOUND', kind, 'attempt', attempt + 1, 'seat', selected.seat);
        break;
      }
      await host.db.reducers.removeGameTable({ tableId: table.id });
    }
    assert.ok(selected && table, `Find real ${kind} seed`);
    for (const person of people.slice(1))
      await person.db.reducers.joinTable({
        tableId: table.id,
        lobbyMemberId: `member_${room.id}_${person.clientId}`,
        buyIn: 1000,
      });
    const state = (): BlackjackState =>
      readBlackjackState(
        JSON.parse(db.gameTable.id.find(table!.id)!.stateJson),
      );
    const move = async (seat: number, intent: unknown): Promise<void> => {
      const previous = state(),
        before = JSON.stringify(previous);
      await people[seat].db.reducers.handleGameIntent({
        tableId: table!.id,
        clientId: people[seat].clientId,
        intentPayload: JSON.stringify(intent),
      });
      await until(() => JSON.stringify(state()) !== before, 'Move replicated');
      if (
        (intent as { type: string }).type !== 'start_game' &&
        previous.phase === 'play'
      )
        assert.deepEqual(
          state(),
          readBlackjackState(apply(previous, intent as BlackjackIntent)),
          'Server result follows authoritative Blackjack rules',
        );
    };
    await move(0, { type: 'start_game' });
    const actualPlan = plan(state(), kind);
    assert.ok(actualPlan, 'Pure planning matches actual server shoe');
    selected = actualPlan;
    if (process.env.BLACKJACK_SDK_ONLY === '1') {
      assert.equal(kind, 'split');
      for (const action of selected.moves)
        await move(action.seat, action.intent);
      assert.equal(state().seats[String(selected.seat)].hands.length, 4);
      const actions = new Set<string>();
      for (let n = 0; state().phase !== 'finished' && n < 80; n++) {
        const current = state();
        const intent: BlackjackIntent =
          current.step === 'insurance'
            ? { type: 'insurance', take: false }
            : !actions.has('hit') && legal(current, { type: 'hit' })
              ? { type: 'hit' }
              : !actions.has('double') && legal(current, { type: 'double' })
                ? { type: 'double' }
                : !actions.has('surrender') &&
                    legal(current, { type: 'surrender' })
                  ? { type: 'surrender' }
                  : { type: 'stand' };
        await move(current.turnSeatIndex!, intent);
        actions.add(intent.type);
      }
      assert.equal(state().phase, 'finished');
      const settled = state();
      await until(
        () =>
          people.every(
            (person) =>
              JSON.stringify(
                readBlackjackState(
                  JSON.parse(
                    person.db.db.gameTable.id.find(table!.id)!.stateJson,
                  ),
                ),
              ) === JSON.stringify(settled),
          ),
        'Five independent SDK subscriptions agree',
      );
      proofs.push({
        kind,
        source:
          'Separate SDK-only audit deal; not the deal pictured in browser screenshots',
        fiveIndependentSubscriptionsAgree: true,
        maximumSplitSeat: selected.seat,
        actions: [...actions],
        dealer: settled.dealer,
        dealerTotal: blackjackTotal(settled.dealer),
        holeHidden: settled.holeHidden,
        seats: settled.seats,
      });
      log('SDK_SPLIT_SETTLEMENT_PASSED', 'five independent subscriptions');
      continue;
    }
    if (!gate) {
      gate = true;
      if (process.env.BLACKJACK_WAIT_FOR_SLOT === '1') {
        log('READY_FOR_BROWSER_SLOT');
        await new Promise<void>((resolve) =>
          process.stdin.once('data', () => resolve()),
        );
      }
      browser = await chromium.launch({
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox'],
      });
    }
    let personIndex = 0,
      mobile = false;
    const open = async (
      index: number,
      touch: boolean,
      spectator = false,
    ): Promise<void> => {
      await context?.close();
      personIndex = index;
      mobile = touch;
      const person = people[index];
      context = await browser!.newContext({
        viewport: touch
          ? { width: 844, height: 390 }
          : { width: 1440, height: 900 },
        isMobile: touch,
        hasTouch: touch,
      });
      await context.addInitScript(
        ({ person, code, tableId }) => {
          localStorage.setItem('clientId', person.clientId);
          localStorage.setItem('stdbToken', person.token);
          localStorage.setItem(
            'lastRoom',
            JSON.stringify({
              lobbyCode: code,
              tableId,
              name: person.name.slice(0, 12),
            }),
          );
        },
        {
          person: {
            clientId: person.clientId,
            token: person.token,
            name: person.name,
          },
          code: room.code,
          tableId: table!.id,
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
            ) + '\nwindow.__blackjackEngine=engine;\n',
        });
      });
      page = await context.newPage();
      page.on('pageerror', (error) => {
        errors.push(error.message);
        log('PAGEERROR', error.message);
      });
      await page.goto('http://127.0.0.1:5175/');
      try {
        await page.waitForFunction(
          (id) =>
            window.__blackjackEngine?.currentScene.lastRow?.id === id &&
            window.__blackjackEngine.currentScene.blackjackDriver.ready,
          table!.id,
        );
      } catch (error) {
        await page.screenshot({ path: `${out}${kind}-bootstrap-failure.png` });
        log(
          'BOOTSTRAP',
          JSON.stringify(
            await page.evaluate(() => {
              const engine = window.__blackjackEngine,
                scene = engine?.currentScene;
              return {
                hasEngine: !!engine,
                scene: scene?.constructor.name,
                row: scene?.lastRow?.id,
                ready: scene?.blackjackDriver?.ready,
                text: scene?.actors
                  ?.filter((a) => !a.isKilled())
                  .map((a) => ({
                    name: a.name,
                    text: a.graphics.current?.text,
                  }))
                  .filter((a) => a.text),
              };
            }),
          ),
        );
        throw error;
      }
      if (person.name.length > 12)
        await person.db.reducers.joinLobby({
          lobbyCode: room.code,
          clientId: person.clientId,
          name: person.name,
        });
      await delay(500);
      log(
        'OPEN',
        kind,
        spectator ? 'spectator' : index,
        touch ? 'mobile' : 'desktop',
      );
    };
    const sync = async (): Promise<void> => {
      await page!.waitForFunction(
        (actual) =>
          JSON.stringify(
            window.__blackjackEngine?.currentScene.blackjackDriver.state,
          ) === actual,
        JSON.stringify(state()),
      );
    };
    const capture = async (
      stage: string,
      bothPhones = false,
    ): Promise<void> => {
      await sync();
      await page!.bringToFront();
      await delay(400);
      await page!.screenshot({
        path: `${out}${kind}-${stage}-${mobile ? 'mobile' : 'desktop'}.png`,
      });
      if (mobile && bothPhones) {
        await page!.setViewportSize({ width: 667, height: 375 });
        await delay(500);
        await page!.screenshot({
          path: `${out}${kind}-${stage}-small-mobile.png`,
        });
        await page!.setViewportSize({ width: 844, height: 390 });
        await delay(300);
      }
      log('CAPTURED', kind, stage);
    };
    const click = async (name: string, actorX?: number): Promise<void> => {
      await sync();
      await page!.bringToFront();
      await page!.waitForFunction(
        ({ name, actorX }) =>
          window.__blackjackEngine.currentScene.actors.some(
            (a) =>
              a.name === name &&
              !a.isKilled() &&
              a.graphics.isVisible &&
              (actorX === undefined || a.pos.x === actorX),
          ),
        { name, actorX },
      );
      const position = await page!.evaluate(
        ({ name, actorX }) => {
          const actor = window.__blackjackEngine.currentScene.actors.find(
            (a) =>
              a.name === name &&
              !a.isKilled() &&
              a.graphics.isVisible &&
              (actorX === undefined || a.pos.x === actorX),
          );
          if (!actor) throw Error(`Missing actor ${name}`);
          return {
            x: actor.pos.x + actor.width / 2,
            y: actor.pos.y + actor.height / 2,
          };
        },
        { name, actorX },
      );
      const canvas = await page!.evaluate(() => {
          const canvas = [...document.querySelectorAll('canvas')].find(
            (canvas) => {
              const box = canvas.getBoundingClientRect();
              return box.width > 0 && box.height > 0;
            },
          );
          if (!canvas) throw Error('No visible game canvas');
          const box = canvas.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }),
        scale = canvas.height / 540,
        gutter = (canvas.width / scale - 960) / 2;
      const x = canvas.x + (position.x + gutter) * scale,
        y = canvas.y + position.y * scale;
      if (mobile) await page!.touchscreen.tap(x, y);
      else await page!.mouse.click(x, y);
      await delay(120);
    };
    const check = async (): Promise<void> => {
      const data = await page!.evaluate(() => {
        const scene = window.__blackjackEngine.currentScene,
          d = scene.blackjackDriver;
        return {
          classic: scene.usesClassicLayout,
          names: scene.actors.filter(
            (a) => a.name === 'blackjack-player-name' && !a.isKilled(),
          ).length,
          prize: scene.prizeBadge.graphics.isVisible,
          hiddenDealer: [...d.cards]
            .filter(([id]) => id.startsWith('dealer:'))
            .filter(([, r]) => !r.faceUp).length,
          privateOther: [...d.cards].filter(
            ([id, r]) => id.startsWith('rail:') && !r.faceUp,
          ).length,
          controls: d.controls.map((c) => c.target),
        };
      });
      assert.equal(data.classic, true);
      assert.equal(data.names, 5);
      assert.equal(data.prize, false);
      assert.equal(data.privateOther, 0);
      assert.equal(
        data.hiddenDealer,
        state().holeHidden && state().dealer.length > 1 ? 1 : 0,
      );
      proofs.push({ kind, person: personIndex, ...data });
    };
    const openReplica = async (index: number): Promise<void> => {
      if (process.env.BLACKJACK_REPLICAS !== '1') return;
      const primary = { context, page, personIndex, mobile };
      context = undefined;
      await open(index, false);
      replicaContext = context;
      replicaPage = page;
      ({ context, page, personIndex, mobile } = primary);
    };
    const verifyReplica = async (stage: string): Promise<void> => {
      if (!replicaPage) return;
      if (stage.includes('settled') || stage.includes('result'))
        assert.equal(state().phase, 'finished');
      await sync();
      const authoritative = JSON.stringify(state());
      await replicaPage.waitForFunction(
        (actual) =>
          JSON.stringify(
            window.__blackjackEngine?.currentScene.blackjackDriver.state,
          ) === actual,
        authoritative,
      );
      await replicaPage.bringToFront();
      await replicaPage.screenshot({
        path: `${out}${kind}-${stage}-replica-desktop.png`,
      });
      log('VERIFIED_REPLICA', kind, stage);
      proofs.push({
        kind,
        independentReplica: stage,
        stateMatchesAuthoritative: true,
      });
    };
    const closeReplica = async (): Promise<void> => {
      await replicaContext?.close();
      replicaContext = undefined;
      replicaPage = undefined;
      await page!.bringToFront();
    };
    if (!fast) {
      await open(0, false);
      await capture('01-five-player-wagers');
      await check();
    }
    if (kind === 'split') {
      // First wager is a real desktop canvas action.
      if (fast) await move(0, { type: 'bet', amount: 25 });
      else await click('classic-bet-25');
      await until(() => state().turnSeatIndex !== 0, 'Canvas wager accepted');
      for (const action of selected.moves.slice(1))
        await move(action.seat, action.intent);
      assert.equal(state().seats[String(selected.seat)].hands.length, 4);
      await open(selected.seat, true);
      await capture('02-four-split-hands', true);
      await check();
      const totals = await page!.evaluate(() => {
        const scene = window.__blackjackEngine.currentScene;
        return scene.actors
          .filter((a) => a.name === 'blackjack-local-total' && !a.isKilled())
          .map((a) => a.graphics.current.text);
      });
      assert.ok(totals[0].includes('/4'));
      if (!fast) {
        await click('classic-‹', 220);
        await capture('03-review-other-split', true);
        const returnControl = await page!.evaluate(
          () =>
            window.__blackjackEngine.currentScene.blackjackDriver.controls.find(
              (c) => c.target === 'active-hand',
            )?.label,
        );
        if (returnControl) {
          await click(
            `classic-${returnControl.toLowerCase().replaceAll(' ', '-')}`,
          );
          await delay(100);
        }
        // Dealer hole remains hidden even when every public player hand is inspected.
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
        await open(5, false, true);
        await capture('04-five-player-spectator');
        await check();
        await open(selected.seat, true);
      }
      await openReplica((selected.seat + 1) % 5);
      await verifyReplica('04-live-multiplayer');
      await closeReplica();
      let hit = false,
        doubled = false,
        surrendered = false;
      for (let n = 0; state().phase !== 'finished' && n < 80; n++) {
        const s = state(),
          seat = s.turnSeatIndex!;
        let intent: BlackjackIntent;
        if (s.step === 'insurance') intent = { type: 'insurance', take: false };
        else if (!hit && legal(s, { type: 'hit' })) {
          intent = { type: 'hit' };
          hit = true;
        } else if (!doubled && legal(s, { type: 'double' })) {
          intent = { type: 'double' };
          doubled = true;
        } else if (!surrendered && legal(s, { type: 'surrender' })) {
          intent = { type: 'surrender' };
          surrendered = true;
        } else intent = { type: 'stand' };
        if (
          seat === personIndex &&
          ['hit', 'double', 'stand'].includes(intent.type)
        ) {
          await sync();
          await click(`classic-${intent.type}`);
          await until(
            () => JSON.stringify(state()) !== JSON.stringify(s),
            'Canvas decision accepted',
          );
        } else await move(seat, intent);
      }
      assert.equal(state().phase, 'finished');
      await openReplica((selected.seat + 1) % 5);
      await verifyReplica('05-settled-results');
      await closeReplica();
      await capture('05-settled-results', true);
      await check();
      proofs.push({
        fourSplitHands: true,
        hit,
        doubled,
        surrendered,
        settledResults: state().seats[String(selected.seat)].results,
        dealerTotal: blackjackTotal(state().dealer),
      });
    } else {
      let insuranceTaken = false;
      for (const action of selected.moves)
        await move(action.seat, action.intent);
      while (
        state().step === 'insurance' &&
        state().turnSeatIndex !== selected.seat
      ) {
        const take =
          !insuranceTaken && legal(state(), { type: 'insurance', take: true });
        await move(state().turnSeatIndex!, { type: 'insurance', take });
        insuranceTaken ||= take;
      }
      assert.equal(state().step, 'insurance');
      assert.equal(state().turnSeatIndex, selected.seat);
      await open(selected.seat, true);
      await openReplica((selected.seat + 1) % 5);
      await capture('02-insurance-even-money', true);
      await check();
      await verifyReplica('02-insurance-even-money');
      await closeReplica();
      assert.equal(legal(state(), { type: 'even_money' }), true);
      await click('classic-even-money');
      await until(
        () => state().seats[String(selected!.seat)].evenMoney === true,
        'Canvas even money accepted',
      );
      for (let n = 0; state().phase !== 'finished' && n < 60; n++) {
        const take =
          !insuranceTaken && legal(state(), { type: 'insurance', take: true });
        await move(
          state().turnSeatIndex!,
          state().step === 'insurance'
            ? { type: 'insurance', take }
            : { type: 'stand' },
        );
        insuranceTaken ||= take;
      }
      await openReplica((selected.seat + 1) % 5);
      await verifyReplica('03-even-money-result');
      await closeReplica();
      await capture('03-even-money-result', true);
      await check();
      // Shared header callbacks still work in classic mode.
      await click('classic-?');
      await page!.waitForFunction(
        () => window.__blackjackEngine.currentScene.howToPlay.isOpen,
      );
      await page!.keyboard.press('Escape');
      await delay(150);
      await click('classic-chat');
      await page!.waitForFunction(
        () => window.__blackjackEngine.currentScene.tableChat.isOpen,
      );
      await page!.keyboard.press('Escape');
      await delay(150);
      await click('classic-leave-table');
      await page!.waitForFunction(
        () => !JSON.parse(localStorage.getItem('lastRoom') || '{}').tableId,
      );
      proofs.push({
        insuranceAndEvenMoney: true,
        insuranceTaken,
        headerNavigation: true,
        settledSeats: Object.fromEntries(
          Object.entries(state().seats).map(([seat, row]) => [
            seat,
            {
              chips: row.chips,
              insurance: row.insurance,
              evenMoney: row.evenMoney,
              results: row.results,
            },
          ]),
        ),
      });
    }
    await context?.close();
    await replicaContext?.close();
    replicaContext = undefined;
    replicaPage = undefined;
    context = undefined;
    page = undefined;
    // End this local test table safely before searching the next one.
    if (kind === 'split') {
      for (const person of people.slice(0, 5))
        await person.db.reducers
          .leaveTable({
            tableId: table.id,
            lobbyMemberId: `member_${room.id}_${person.clientId}`,
          })
          .catch(() => {});
      if (people.length > 5) people.pop()!.db.disconnect();
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out +
      (process.env.BLACKJACK_CASE
        ? `proof-${process.env.BLACKJACK_CASE}.json`
        : 'proof.json'),
    JSON.stringify({ players: 5, dealer: 1, proofs, errors }, null, 2),
  );
  writeFileSync(out + 'run.log', events.join('\n'));
  log('CLASSIC BLACKJACK PROOF PASSED');
} finally {
  writeFileSync(out + 'run.log', events.join('\n'));
  await context?.close();
  await replicaContext?.close();
  await browser?.close();
  if (roomCode)
    await host.db.reducers.closeLobby({ lobbyCode: roomCode }).catch(() => {});
  for (const person of people) person.db.disconnect();
}
