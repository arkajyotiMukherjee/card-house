/* global process, window, localStorage, URL, crypto */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { PNG } from '../client/node_modules/pngjs/lib/png.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const base = process.env.ROOM_ECONOMY_URL ?? 'http://127.0.0.1:5175';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw Error('Local app required');
const out = fileURLToPath(
  new URL('../docs/lobby-ux-evidence/', import.meta.url),
);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const errors = [];
async function context(mobile = false) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 844, height: 390 }
      : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()) + '\nwindow.__lobbyProofEngine = engine;\n',
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page };
}
async function tap(page, x, y, right = false) {
  const box = await page.locator('canvas').boundingBox(),
    width = Math.round((box.width / box.height) * 540),
    gutter = (width - 960) / 2;
  await page.mouse.click(
    box.x + ((x + gutter + (right ? gutter : 0)) / width) * box.width,
    box.y + (y / 540) * box.height,
  );
  await page.waitForTimeout(300);
}
async function fieldCaret(page) {
  const input = page.getByRole('textbox', {
    name: 'Table name (optional)',
    exact: true,
  });
  await input.waitFor({ state: 'visible' });
  await input.fill('Friday Omaha');
  await input.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() =>
    window.__lobbyProofEngine.currentScene.actors.some((actor) =>
      actor.children.some(
        (child) =>
          child.name === 'table-name-caret' && child.graphics.opacity === 1,
      ),
    ),
  );
  const state = await page.evaluate(() => {
    const popup = window.__lobbyProofEngine.currentScene.actors.find((actor) =>
      actor.children.some((child) => child.name === 'table-name-caret'),
    );
    const caret = popup.children.find(
      (child) => child.name === 'table-name-caret',
    );
    return {
      x: popup.pos.x,
      w: popup.width,
      y: popup.pos.y,
      h: popup.height,
      caretX: caret.pos.x,
    };
  });
  assert.equal(state.x + state.w / 2, 480);
  assert.equal(state.y + state.h / 2, 270 + (state.h === 496 ? 10 : 0));
  return state;
}
try {
  const desktop = await context();
  await desktop.page.goto(base + '/');
  await desktop.page.waitForFunction(() => {
    const scene = window.__lobbyProofEngine?.currentScene;
    return (
      scene?.constructor.name === 'MenuScene' &&
      scene.actors.some((actor) => actor.pos.y === 168 && actor.width === 400)
    );
  });
  await tap(desktop.page, 480, 190);
  await desktop.page
    .getByRole('textbox', { name: 'Your Name', exact: true })
    .fill('Caret Proof');
  await tap(desktop.page, 350, 348);
  await desktop.page
    .getByRole('textbox', { name: 'Starting chips', exact: true })
    .waitFor({ state: 'visible' });
  await desktop.page.screenshot({
    path: out + '14-starting-chips-wording.png',
  });
  await tap(desktop.page, 334, 344);
  await desktop.page.waitForFunction(() =>
    Boolean(JSON.parse(localStorage.getItem('lastRoom') || '{}').lobbyCode),
  );
  await desktop.page.waitForTimeout(1000);
  await tap(desktop.page, 550, 106, true);
  const desktopState = await fieldCaret(desktop.page);
  await desktop.page.screenshot({
    path: out + '15-desktop-centered-create-caret.png',
  });
  const code = await desktop.page.evaluate(
    () => JSON.parse(localStorage.getItem('lastRoom')).lobbyCode,
  );
  const mobile = await context(true);
  await mobile.context.addInitScript((code) => {
    localStorage.setItem('clientId', crypto.randomUUID());
    localStorage.setItem(
      'lastRoom',
      JSON.stringify({ lobbyCode: code, name: 'Mobile Caret', tableId: '' }),
    );
  }, code);
  await mobile.page.goto(base + '/');
  await mobile.page.waitForFunction(
    () => window.__lobbyProofEngine?.currentScene.actors.length > 10,
  );
  await tap(mobile.page, 550, 106, true);
  const mobileState = await fieldCaret(mobile.page);
  await mobile.page.screenshot({
    path: out + '16-mobile-table-name-caret.png',
  });
  async function stakes(page, mobile = false) {
    await tap(page, mobile ? 224 : 312, mobile ? 140 : 228);
    await tap(page, mobile ? 324 : 375, mobile ? 480 : 374);
    const minimum = page.getByRole('textbox', {
      name: 'Minimum buy-in',
      exact: true,
    });
    const buyIn = page.getByRole('textbox', {
      name: 'Your buy-in',
      exact: true,
    });
    await minimum.waitFor({ state: 'visible' });
    await minimum.focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('1100');
    assert.equal(await buyIn.inputValue(), '1100');
    await page.screenshot({
      path:
        out +
        (mobile ? '19-mobile-auto-buy-in' : '17-desktop-auto-buy-in') +
        '.png',
    });
    await buyIn.focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('400');
    await tap(page, 334, mobile ? 486 : 452);
    await page.waitForFunction(() =>
      window.__lobbyProofEngine.currentScene.actors.some((actor) =>
        actor.graphics.current?.text?.includes('Your buy-in must be at least'),
      ),
    );
    assert.equal(await buyIn.isVisible(), true);
    await page.screenshot({
      path:
        out +
        (mobile
          ? '20-mobile-inline-buy-in-error'
          : '18-desktop-inline-buy-in-error') +
        '.png',
    });
    await page.keyboard.press('Escape');
  }
  await stakes(desktop.page);
  await stakes(mobile.page, true);
  await tap(desktop.page, 585, 374);
  await tap(desktop.page, 720, 30, true);
  const chat = desktop.page.getByRole('textbox', { name: 'Chat', exact: true });
  await chat.fill('hello desktop');
  await chat.focus();
  await desktop.page.keyboard.press('End');
  const caretX = () =>
    desktop.page.evaluate(
      () =>
        window.__lobbyProofEngine.currentScene.actors.find(
          (actor) => actor.name === 'lobby-chat-caret',
        ).pos.x,
    );
  await desktop.page.waitForTimeout(100);
  const endX = await caretX();
  await desktop.page.keyboard.press('ArrowLeft');
  await desktop.page.waitForTimeout(100);
  const leftX = await caretX();
  assert.equal(endX - leftX, 8);
  await desktop.page.keyboard.press('Home');
  await desktop.page.waitForTimeout(100);
  const startX = await caretX();
  assert.equal(endX - startX, 13 * 8);
  await desktop.page.keyboard.press('End');
  await desktop.page.waitForTimeout(100);
  await desktop.page.screenshot({
    path: out + '21-desktop-chat-moving-caret.png',
  });
  async function pressCanvas(page, label) {
    const box = await page.evaluate((label) => {
      const actor = window.__lobbyProofEngine.currentScene.actors.find(
        (actor) =>
          actor.graphics.isVisible &&
          actor.children.some(
            (child) => child.graphics.current?.text === label,
          ),
      );
      if (!actor) throw Error('Missing canvas button: ' + label);
      return {
        x: actor.pos.x + actor.width / 2,
        y: actor.pos.y + actor.height / 2,
      };
    }, label);
    await tap(page, box.x, box.y);
  }
  const waitingCount = (page, count) =>
    page.waitForFunction((count) => {
      const scene = window.__lobbyProofEngine.currentScene;
      return (
        scene.constructor.name === 'GameScene' &&
        scene.tableChat.waiting?.seated === count
      );
    }, count);
  // Exercise the actual host-create, guest-join, leave, rejoin and start controls.
  await tap(desktop.page, 720, 30, true);
  await tap(desktop.page, 550, 106, true);
  for (let i = 0; i < 3; i++) await tap(desktop.page, 512, 228);
  await tap(desktop.page, 392, 276);
  await tap(desktop.page, 392, 276);
  await tap(desktop.page, 375, 374);
  await desktop.page
    .getByRole('textbox', { name: 'Your buy-in', exact: true })
    .waitFor({ state: 'visible' });
  await tap(desktop.page, 334, 452);
  await waitingCount(desktop.page, 1);
  await tap(mobile.page, 636, 480);
  async function join(page, mobile = false) {
    await tap(page, 492, mobile ? 210 : 206, true);
    await page
      .getByRole('textbox', { name: 'Your buy-in', exact: true })
      .waitFor({ state: 'visible' });
    await tap(page, 334, mobile ? 370 : 344);
  }
  await join(mobile.page, true);
  await waitingCount(desktop.page, 2);
  await waitingCount(mobile.page, 2);
  const guestActions = await mobile.page.evaluate(() => {
    const overlay = window.__lobbyProofEngine.currentScene.tableChat;
    return {
      startVisible: overlay.startControl.graphics.isVisible,
      copyX: overlay.copyLinkControl.pos.x,
    };
  });
  assert.equal(guestActions.startVisible, false);
  assert.equal(guestActions.copyX, 580);
  await desktop.page.screenshot({
    path: out + '22-host-two-seats-actions.png',
  });
  await mobile.page.screenshot({
    path: out + '23-mobile-guest-two-seats-actions.png',
  });
  // A seat removed on the server must never trap its former viewer in this screen.
  await mobile.page.evaluate(async () => {
    const scene = window.__lobbyProofEngine.currentScene;
    await scene.connection.reducers.leaveTable({
      tableId: scene.tableId,
      lobbyMemberId: scene.lobbyMemberId,
    });
  });
  await waitingCount(desktop.page, 1);
  await pressCanvas(desktop.page, 'Leave');
  await waitingCount(mobile.page, 0);
  await pressCanvas(mobile.page, 'Leave');
  await mobile.page.waitForFunction(
    () =>
      window.__lobbyProofEngine.currentScene.constructor.name === 'BootScene',
  );
  await mobile.page.screenshot({
    path: out + '26-released-seat-leaves-safely.png',
  });
  await join(desktop.page);
  await waitingCount(desktop.page, 1);
  await join(mobile.page, true);
  await waitingCount(desktop.page, 2);
  await waitingCount(mobile.page, 2);
  const topUpError = await desktop.page.evaluate(async () => {
    const scene = window.__lobbyProofEngine.currentScene;
    try {
      await scene.connection.reducers.topUpTable({
        tableId: scene.tableId,
        amount: 50000,
      });
    } catch (error) {
      return error.message;
    }
  });
  assert.equal(topUpError, 'Top-up is outside the buy-in limits');
  await pressCanvas(desktop.page, 'Start Game');
  for (const view of [desktop, mobile])
    await view.page.waitForFunction(() => {
      const scene = window.__lobbyProofEngine.currentScene;
      return (
        scene.constructor.name === 'GameScene' &&
        scene.lastRow &&
        !scene.lastRow.waiting &&
        scene.dealActors.length === 0
      );
    });
  for (const [view, name] of [
    [desktop, '24-desktop-host-starts-two-player-game'],
    [mobile, '25-mobile-same-started-game'],
  ]) {
    await view.page.waitForTimeout(1200);
    const bytes = await view.page.screenshot({ path: out + name + '.png' });
    const png = PNG.sync.read(bytes);
    let cream = 0;
    for (let i = 0; i < png.data.length; i += 4)
      if (png.data[i] > 220 && png.data[i + 1] > 210 && png.data[i + 2] > 160)
        cream++;
    assert.ok(
      cream > 1000,
      'Actual cards and gameplay are visible in the screenshot',
    );
  }
  // Replay the actual reducer rejection through the gameplay error presenter,
  // outside the waiting overlay, to check the reported header collision.
  for (const [view, name] of [
    [desktop, '27-desktop-error-below-header'],
    [mobile, '28-mobile-error-below-header'],
  ]) {
    await view.page.evaluate((message) => {
      window.__lobbyProofEngine.currentScene.showError(message);
    }, topUpError);
    await view.page.waitForFunction(() =>
      window.__lobbyProofEngine.currentScene.actors.some(
        (actor) => actor.name === 'table-notice' && actor.pos.y >= 194,
      ),
    );
    await view.page.screenshot({ path: out + name + '.png' });
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + 'dialog-proof.json',
    JSON.stringify(
      {
        desktopCentered: true,
        desktopCaret: true,
        mobileCaret: true,
        startingChipsWording: true,
        automaticMinimumBuyIn: true,
        manualLowerBuyInShowsInlineError: true,
        chatCaret: { endX, leftX, startX },
        guestActions,
        hostAndGuestBothSeeTwoOfFive: true,
        releasedSeatCanLeave: true,
        hostStartsAfterRejoin: true,
        tableErrorBelowHeader: topUpError,
        desktop: desktopState,
        mobile: mobileState,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
