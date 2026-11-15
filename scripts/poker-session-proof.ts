/** Local two-client regression for paid poker rebuys, returns, and final cash-outs. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DbConnection } from '../client/src/module_bindings/index.ts';
import {
  pokerRules,
  advancePoker,
  type PokerState,
} from '../src/shared/games/poker.ts';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Scene readiness checks wait for rendered UI; canvas font reloads must not block captures.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const evidence = fileURLToPath(
  new URL('../docs/lobby-ux-evidence/', import.meta.url),
);
async function until(check: () => boolean, label: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw Error(label);
    await delay(50);
  }
}
async function connect(name: string) {
  let token = '';
  const db = await new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder()
      .withUri('http://127.0.0.1:3000')
      .withDatabaseName('room-economy-test')
      .onConnect((db, _identity, saved) => {
        token = saved;
        db.subscriptionBuilder()
          .onApplied(() => resolve(db))
          .onError(reject)
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
  return { db, name, clientId: crypto.randomUUID(), token };
}
const people = await Promise.all([
  connect('Session Host'),
  connect('Session Peer'),
]);
const [host, guest] = people;
const proof: Record<string, unknown> = {};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const known = new Set([...host.db.db.lobby.iter()].map((row) => row.id));
  await host.db.reducers.createLobby({ startingCoins: 5000 });
  const room = [...host.db.db.lobby.iter()].find((row) => !known.has(row.id))!;
  for (const person of people)
    await person.db.reducers.joinLobby({
      lobbyCode: room.code,
      clientId: person.clientId,
      name: person.name,
    });
  const member = (person: typeof host) =>
    `member_${room.id}_${person.clientId}`;
  const tableRow = (id: string) => host.db.db.gameTable.id.find(id)!;
  const state = (id: string) =>
    JSON.parse(tableRow(id).stateJson) as PokerState;
  const seatId = (id: string, person: typeof host) =>
    `seat_${id}_${member(person)}`;
  const wallet = (person: typeof host) =>
    host.db.db.roomWallet.id.find(member(person))!;
  const total = () =>
    people.reduce((sum, person) => sum + wallet(person).available, 0n) +
    [...host.db.db.tableFunding.iter()]
      .filter(
        (row) =>
          row.tableId.startsWith('table_') &&
          people.some((person) => row.walletId === member(person)),
      )
      .reduce((sum, row) => sum + row.units, 0n);
  const join = (id: string, person: typeof host, buyIn = 100) =>
    person.db.reducers.joinTable({
      tableId: id,
      lobbyMemberId: member(person),
      buyIn,
    });
  const leave = (id: string, person: typeof host) =>
    person.db.reducers.leaveTable({
      tableId: id,
      lobbyMemberId: member(person),
    });
  const intent = async (id: string, person: typeof host, move: unknown) => {
    const before = tableRow(id).stateJson;
    await person.db.reducers.handleGameIntent({
      tableId: id,
      clientId: person.clientId,
      intentPayload: JSON.stringify(move),
    });
    await until(() => tableRow(id).stateJson !== before, 'Move replicated');
  };
  const create = async () => {
    const known = new Set(
      [...host.db.db.gameTable.iter()].map((row) => row.id),
    );
    await host.db.reducers.createGameTable({
      lobbyId: room.id,
      gameType: 'poker',
      settings: JSON.stringify({
        name: 'Session proof',
        maxPlayers: 5,
        smallBlind: 5,
        bigBlind: 10,
        minBuyIn: 100,
        maxBuyIn: 1000,
        buyIn: 100,
      }),
    });
    const id = [...host.db.db.gameTable.iter()].find(
      (row) => !known.has(row.id),
    )!.id;
    await join(id, guest);
    await intent(id, host, { type: 'start_game' });
    return id;
  };
  const id = await create();
  // Ties are possible; keep playing until someone really reaches zero.
  for (let hand = 0; hand < 8; hand++) {
    const first = state(id).turnSeatIndex!;
    await intent(id, people[first], { type: 'raise', amount: 100 });
    await intent(id, people[state(id).turnSeatIndex!], { type: 'call' });
    await until(() => state(id).phase === 'finished', 'All-in runout');
    if (Object.values(state(id).seats).some((seat) => seat.chips === 0)) break;
    const number = state(id).handNumber;
    await until(() => state(id).handNumber > number, 'Tie redeals', 16000);
  }
  const zeroIndex = Object.entries(state(id).seats).find(
    ([, seat]) => seat.chips === 0,
  )![0];
  const loser = people[Number(zeroIndex)];
  const before = wallet(loser).available;
  const retained = Boolean(host.db.db.gameSeat.id.find(seatId(id, loser)));
  if (process.env.POKER_SESSION_EXPECT_BUG === '1') {
    assert.equal(retained, false);
    await join(id, loser, 100);
    proof.zeroStackSeatIncorrectlyReleased = true;
    proof.finishedGameIncorrectlyAcceptsBuyIn = true;
    writeFileSync(
      '/tmp/poker-session-before.json',
      JSON.stringify(proof, null, 2),
    );
    console.log(
      'REPRODUCED: zero-stack seat removed and finished table accepts another buy-in',
    );
    process.exitCode = 0;
  } else if (process.env.POKER_SESSION_DISCONNECT_PROOF === '1') {
    assert.equal(retained, true);
    const observer = people.find((person) => person !== loser)!;
    loser.db.disconnect();
    await delay(1500);
    assert.ok(
      observer.db.db.gameSeat.id.find(seatId(id, loser)),
      'The reconnect grace preserves the zero-stack seat',
    );
    await until(
      () => observer.db.db.gameTable.id.find(id)?.status.tag === 'Finished',
      'Disconnect grace cashes out and closes the paused session',
      45000,
    );
    assert.equal(
      [...observer.db.db.tableFunding.iter()].filter(
        (row) => row.tableId === id,
      ).length,
      0,
    );
    assert.equal(
      people.reduce(
        (sum, person) =>
          sum + observer.db.db.roomWallet.id.find(member(person))!.available,
        0n,
      ),
      20000n,
    );
    writeFileSync(
      '/tmp/poker-session-disconnect.json',
      JSON.stringify(
        {
          zeroStackRetainedDuringGrace: true,
          pausedDisconnectClosesAfterGrace: true,
          allStacksCashedOut: true,
          chipsConserved: true,
        },
        null,
        2,
      ),
    );
    console.log('PAUSED DISCONNECT PROOF PASSED');
  } else {
    assert.equal(retained, true);
    assert.equal(tableRow(id).status.tag, 'InProgress');
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const views = [];
    for (const [index, person] of people.entries()) {
      const context = await browser.newContext({
        viewport: index
          ? { width: 844, height: 390 }
          : { width: 1440, height: 900 },
        isMobile: Boolean(index),
        hasTouch: Boolean(index),
      });
      await context.addInitScript(
        ({ person, code, tableId }) => {
          if (localStorage.getItem('clientId')) return;
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
            name: person.name,
            token: person.token,
          },
          code: room.code,
          tableId: id,
        },
      );
      await context.route('**/src/main.ts*', async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body:
            (await response.text()) + '\nwindow.__lobbyProofEngine = engine;\n',
        });
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:5175');
      await page
        .waitForFunction(() => {
          const scene = window.__lobbyProofEngine?.currentScene;
          return (
            scene?.constructor.name === 'GameScene' &&
            scene.lastRow &&
            scene.actors.length > 10
          );
        })
        .catch(async (error) => {
          console.log(
            'Browser readiness failed',
            index,
            await page.evaluate(() => {
              const scene = window.__lobbyProofEngine?.currentScene;
              return {
                scene: scene?.constructor.name,
                actors: scene?.actors.length,
                saved: localStorage.getItem('lastRoom'),
                text: scene?.actors
                  .flatMap((actor) => [
                    actor.graphics.current?.text,
                    ...actor.children.map(
                      (child) => child.graphics.current?.text,
                    ),
                  ])
                  .filter(Boolean),
              };
            }),
          );
          await page.screenshot({ path: '/tmp/poker-browser-readiness.png' });
          throw error;
        });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: `${evidence}${index ? '30-mobile' : '29-desktop'}-zero-stack-can-top-up.png`,
      });
      views.push(page);
    }
    await join(id, loser, 900);
    assert.equal(
      wallet(loser).available,
      before,
      'Return ignores fresh buy-in and preserves zero stack',
    );
    assert.equal(host.db.db.tableFunding.id.find(seatId(id, loser))!.units, 0n);
    for (const amount of [100, 50, 50])
      await loser.db.reducers.topUpTable({ tableId: id, amount });
    await until(
      () => state(id).seats[zeroIndex].chips === 200,
      'Top-ups update public state',
    );
    assert.equal(wallet(loser).available, before - 400n);
    assert.equal(
      host.db.db.tableFunding.id.find(seatId(id, loser))!.units,
      400n,
    );
    await assert.rejects(
      loser.db.reducers.topUpTable({ tableId: id, amount: 1000 }),
      /buy-in limits/,
    );
    await until(
      () =>
        people.every(
          (person) =>
            person.db.db.gameTable.id.find(id)!.stateJson ===
            tableRow(id).stateJson,
        ),
      'Both clients share state',
    );
    assert.equal(total(), 20000n, 'Room chips conserved');
    proof.zeroStackSeatRetained = true;
    proof.returnDoesNotChargeOrReplaceStack = true;
    proof.repeatedTopUpsChargeExactlyAndRespectMaximum = true;
    proof.bothClientsShareTopUpState = true;
    for (const [index, page] of views.entries()) {
      await page.waitForFunction(
        (json) =>
          window.__lobbyProofEngine.currentScene.lastRow?.stateJson === json,
        tableRow(id).stateJson,
      );
      await page.screenshot({
        path: `${evidence}${index ? '32-mobile' : '31-desktop'}-shared-top-up-state.png`,
      });
    }
    proof.bothBrowsersShareTopUpState = true;
    const number = state(id).handNumber;
    await until(
      () => state(id).handNumber > number,
      'Top-up resumes next hand',
      16000,
    );
    assert.equal(
      state(id).seats[zeroIndex].chips + state(id).seats[zeroIndex].committed,
      200,
    );
    await intent(id, people[state(id).turnSeatIndex!], { type: 'fold' });
    await leave(id, host);
    await until(
      () => tableRow(id).status.tag === 'Finished',
      'Departure closes session',
    );
    assert.equal(
      [...host.db.db.tableFunding.iter()].filter((row) => row.tableId === id)
        .length,
      0,
    );
    for (const person of people) {
      await assert.rejects(join(id, person, 100), /Game already ended/);
      await assert.rejects(
        person.db.reducers.topUpTable({ tableId: id, amount: 100 }),
        /Game already ended/,
      );
      try {
        await leave(id, person);
      } catch (error) {
        if (!(error instanceof Error) || !/Not seated/.test(error.message))
          throw error;
      }
    }
    assert.equal(total(), 20000n);
    proof.endedSessionRejectsBuyInsAndTopUps = true;
    proof.remainingStackCashedOutExactlyOnce = true;
    // Choose an ordinary random deal where the host will win an all-in showdown.
    let cpuTable = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      cpuTable = await create();
      let predicted = structuredClone(state(cpuTable));
      const rulesTable = { ...tableRow(cpuTable), gameType: 'poker' } as never;
      predicted = pokerRules.applyIntent(
        predicted,
        { type: 'raise', amount: 100 },
        { seat: { seatIndex: 0 } as never, now: 0 },
      );
      predicted = pokerRules.applyIntent(
        predicted,
        { type: 'call' },
        { seat: { seatIndex: 1 } as never, now: 0 },
      );
      while (predicted.phase === 'play')
        predicted = advancePoker(predicted, rulesTable, [0, 1]);
      if (predicted.seats['0'].chips === 200) break;
      await intent(cpuTable, host, { type: 'fold' });
      await leave(cpuTable, host);
      await leave(cpuTable, guest);
      cpuTable = '';
    }
    assert.ok(cpuTable, 'Found a host-winning random deal');
    await intent(cpuTable, host, { type: 'raise', amount: 100 });
    await leave(cpuTable, host);
    // Returning mid-hand must restore the same funded seat without charging.
    const returnBalance = wallet(host).available;
    await join(cpuTable, host, 900);
    assert.equal(wallet(host).available, returnBalance);
    assert.equal(
      host.db.db.tableFunding.id.find(seatId(cpuTable, host))!.units,
      200n,
    );
    await leave(cpuTable, host);
    console.log('Waiting for the real 30-second CPU takeover grace');
    await until(
      () =>
        host.db.db.tableFunding.id.find(seatId(cpuTable, host))?.cpu === true,
      'CPU takes over departed host',
      45000,
    );
    await intent(cpuTable, guest, { type: 'call' });
    await until(() => state(cpuTable).phase === 'finished', 'CPU showdown');
    assert.equal(state(cpuTable).seats['0'].chips, 200);
    await until(
      () => tableRow(cpuTable).status.tag === 'Finished',
      'CPU win closes departed session',
    );
    for (const person of people)
      await assert.rejects(join(cpuTable, person, 100), /Game already ended/);
    assert.equal(
      [...host.db.db.tableFunding.iter()].filter(
        (row) => row.tableId === cpuTable,
      ).length,
      0,
    );
    assert.equal(total(), 20000n);
    await until(
      () =>
        people.every(
          (person) =>
            person.db.db.gameTable.id.find(cpuTable)!.stateJson ===
            tableRow(cpuTable).stateJson,
        ),
      'CPU result shared by both clients',
    );
    proof.cpuHostWinEndsSession = true;
    proof.midHandReturnPreservesPaidSeat = true;
    proof.chipsConserved = true;
    writeFileSync(
      '/tmp/poker-session-browser.json',
      JSON.stringify({
        code: room.code,
        tableId: cpuTable,
        people: people.map(({ db: _db, ...person }) => person),
      }),
      { mode: 0o600 },
    );
    for (const [index, page] of views.entries()) {
      await page.evaluate(
        ({ code, tableId, name }) =>
          localStorage.setItem(
            'lastRoom',
            JSON.stringify({ lobbyCode: code, tableId, name }),
          ),
        { code: room.code, tableId: cpuTable, name: people[index].name },
      );
      // Leave the prior table's deep-link URL before reopening the saved result.
      await page.goto('http://127.0.0.1:5175/');
      await page
        .waitForFunction(() => {
          const scene = window.__lobbyProofEngine?.currentScene;
          return (
            scene?.constructor.name === 'GameScene' &&
            scene.lastRow &&
            scene.actors.length > 10
          );
        })
        .catch(async (error) => {
          console.log(
            'Terminal readiness failed',
            index,
            await page.evaluate(() => {
              const scene = window.__lobbyProofEngine?.currentScene;
              return {
                scene: scene?.constructor.name,
                saved: localStorage.getItem('lastRoom'),
                text: scene?.actors
                  .flatMap((actor) => [
                    actor.graphics.current?.text,
                    ...actor.children.map(
                      (child) => child.graphics.current?.text,
                    ),
                  ])
                  .filter(Boolean),
              };
            }),
          );
          await page.screenshot({ path: '/tmp/poker-terminal-readiness.png' });
          throw error;
        });
      await page.waitForFunction(
        (json) =>
          window.__lobbyProofEngine.currentScene.lastRow?.stateJson === json,
        tableRow(cpuTable).stateJson,
      );
      const topUpHidden = await page.evaluate(
        () => window.__lobbyProofEngine.currentScene.topUpActor.pos.y < 0,
      );
      assert.equal(topUpHidden, true);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: `${evidence}${index ? '34-mobile' : '33-desktop'}-cpu-win-session-ended.png`,
      });
    }
    proof.bothBrowsersShareEndedResultWithoutTopUp = true;
    writeFileSync(
      '/tmp/poker-session-after.json',
      JSON.stringify(proof, null, 2),
    );
    writeFileSync(
      '/tmp/poker-session-browser.json',
      JSON.stringify({
        code: room.code,
        tableId: cpuTable,
        people: people.map(({ db: _db, ...person }) => person),
      }),
      { mode: 0o600 },
    );
    console.log('POKER SESSION PROOF PASSED');
  }
} finally {
  await browser?.close();
  for (const person of people) person.db.disconnect();
}
