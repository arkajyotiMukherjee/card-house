import type { SafeInsets } from './sheets';

/**
 * Phone and tablet shell around the canvas.
 *
 * `(pointer: coarse) and (hover: none)` marks a phone or tablet. A narrow
 * desktop window has a fine pointer and keeps the desktop layout.
 *
 * On such a device the game plays in landscape:
 * - Portrait covers the game with a green and gold panel that asks for
 *   landscape and offers a fullscreen button.
 * - Landscape shows the game and a small fullscreen button until the browser
 *   is actually fullscreen, or the page runs as an installed web app.
 * - Where `document.documentElement.requestFullscreen()` exists, the button
 *   enters fullscreen and then locks the orientation to landscape.
 * - iPhone Safari cannot fullscreen a page or a canvas, so the same button
 *   explains Share, then Add to Home Screen. A phone still upright keeps the
 *   rotate panel.
 */

export const MOBILE_QUERY = '(pointer: coarse) and (hover: none)';
export const STANDALONE_QUERY = '(display-mode: standalone)';
export const FULLSCREEN_QUERY = '(display-mode: fullscreen)';

export const ROTATE_TITLE = 'Rotate the phone to landscape';
export const FULLSCREEN_LABEL = 'Fullscreen';
export const ADD_TO_HOME_NOTE =
  'Safari on iPhone cannot go fullscreen. Tap Share, then Add to Home Screen, and open Card House from that icon.';

export interface ShellInputs {
  mobile: boolean;
  width: number;
  height: number;
  fullscreen: boolean;
  standalone: boolean;
  canFullscreen: boolean;
  iphone: boolean;
}

export type FullscreenAction = 'fullscreen' | 'add-to-home';

export interface ShellView {
  /** The rotate panel covers the game. */
  gate: boolean;
  /** A fullscreen button is on screen: in the panel, or small over the game. */
  button: boolean;
  action: FullscreenAction;
}

type MediaQueryLike = Pick<MediaQueryList, 'matches'> &
  Partial<Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'>>;

interface ShellWindow {
  matchMedia?: (query: string) => MediaQueryLike;
  innerWidth: number;
  innerHeight: number;
  visualViewport?: { width: number; height: number } | null;
  navigator: Navigator;
}

export function isPortrait(width: number, height: number): boolean {
  return height > width;
}

export function isIphoneAgent(userAgent: string): boolean {
  return /iPhone|iPod/.test(userAgent);
}

export function shellView(inputs: ShellInputs): ShellView {
  const action: FullscreenAction = inputs.canFullscreen
    ? 'fullscreen'
    : 'add-to-home';
  if (!inputs.mobile) {
    return { gate: false, button: false, action };
  }
  return {
    gate: isPortrait(inputs.width, inputs.height),
    button: !inputs.standalone && !inputs.fullscreen,
    action,
  };
}

function matches(win: ShellWindow, query: string): boolean {
  return win.matchMedia?.(query).matches === true;
}

export function isMobileDevice(win: ShellWindow = window): boolean {
  return matches(win, MOBILE_QUERY);
}

/** Safari's gesture events can zoom even when viewport limits are ignored. */
export function installGameGestureGuard(
  doc: Document = document,
  mobile: () => boolean = isMobileDevice,
): () => void {
  const preventGesture = (event: Event): void => {
    if (mobile()) event.preventDefault();
  };
  const preventPinch = (event: TouchEvent): void => {
    if (mobile() && event.touches.length > 1) event.preventDefault();
  };
  const preventSelection = (event: Event): void => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('input, textarea, [contenteditable="true"]')
    )
      return;
    event.preventDefault();
  };
  const options = { passive: false };
  doc.addEventListener('selectstart', preventSelection);
  doc.addEventListener('contextmenu', preventSelection);
  doc.addEventListener('dragstart', preventSelection);
  doc.addEventListener('gesturestart', preventGesture, options);
  doc.addEventListener('gesturechange', preventGesture, options);
  doc.addEventListener('touchmove', preventPinch, options);
  return () => {
    doc.removeEventListener('selectstart', preventSelection);
    doc.removeEventListener('contextmenu', preventSelection);
    doc.removeEventListener('dragstart', preventSelection);
    doc.removeEventListener('gesturestart', preventGesture);
    doc.removeEventListener('gesturechange', preventGesture);
    doc.removeEventListener('touchmove', preventPinch);
  };
}

export function visibleSize(win: ShellWindow = window): {
  width: number;
  height: number;
} {
  const viewport = win.visualViewport;
  if (viewport && viewport.width > 0 && viewport.height > 0) {
    return { width: viewport.width, height: viewport.height };
  }
  return { width: win.innerWidth, height: win.innerHeight };
}

export function readShellInputs(
  win: ShellWindow = window,
  doc: Document = document,
): ShellInputs {
  const size = visibleSize(win);
  const iphone = isIphoneAgent(win.navigator.userAgent);
  const navigatorStandalone = (win.navigator as { standalone?: boolean })
    .standalone;
  return {
    mobile: isMobileDevice(win),
    width: size.width,
    height: size.height,
    fullscreen: doc.fullscreenElement != null || matches(win, FULLSCREEN_QUERY),
    standalone: navigatorStandalone === true || matches(win, STANDALONE_QUERY),
    canFullscreen:
      !iphone && typeof doc.documentElement.requestFullscreen === 'function',
    iphone,
  };
}

/** Reads the notch and home-indicator insets through CSS `env()`. */
export function readSafeInsets(doc: Document = document): SafeInsets {
  const probe = doc.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
    'padding-left:env(safe-area-inset-left, 0px)',
  ].join(';');
  doc.body.append(probe);
  const style = doc.defaultView?.getComputedStyle(probe);
  const read = (value: string | undefined): number => {
    const parsed = Number.parseFloat(value ?? '');
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const insets = {
    top: read(style?.paddingTop),
    right: read(style?.paddingRight),
    bottom: read(style?.paddingBottom),
    left: read(style?.paddingLeft),
  };
  probe.remove();
  return insets;
}

interface OrientationLock {
  lock?: (orientation: 'landscape') => Promise<void>;
}

interface ScreenLike {
  orientation?: unknown;
}

/**
 * Enters fullscreen on the page, then locks to landscape. Both can refuse
 * (no gesture, no lock support); the game still plays, so a refusal is quiet.
 */
export async function enterFullscreen(
  doc: Document = document,
  screenObject: ScreenLike = screen,
): Promise<boolean> {
  try {
    await doc.documentElement.requestFullscreen();
  } catch {
    return false;
  }
  try {
    await (screenObject.orientation as OrientationLock | undefined)?.lock?.(
      'landscape',
    );
  } catch {
    // Desktop browsers and some phones have no orientation lock.
  }
  return true;
}

const SHELL_CSS = `
#cardhouse-shell [hidden] { display: none !important; }
#cardhouse-shell { font-family: 'Press Start 2P', monospace; }
#cardhouse-shell .ch-gate {
  position: fixed;
  inset: 0;
  z-index: 20;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right))
    max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
  background: var(--cardhouse-bg, #145c38);
  color: #f4e4b3;
  text-align: center;
  touch-action: manipulation;
}
#cardhouse-shell .ch-gate-frame {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 320px;
  padding: 24px 16px;
  border: 4px solid #e6c27a;
  background: #0b2418;
}
#cardhouse-shell .ch-title { margin: 0; font-size: 14px; line-height: 1.7; color: #e6c27a; }
#cardhouse-shell .ch-note { margin: 0; font-size: 8px; line-height: 1.8; color: #f4e4b3; }
#cardhouse-shell .ch-button {
  box-sizing: border-box;
  min-width: 44px;
  min-height: 44px;
  padding: 0 16px;
  border: 2px solid #e6c27a;
  background: #6e2a24;
  color: #f4e4b3;
  font: inherit;
  font-size: 8px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
#cardhouse-shell .ch-button:active { background: #3f1614; }
#cardhouse-shell .ch-fab {
  position: fixed;
  z-index: 10;
  left: max(8px, env(safe-area-inset-left));
  top: var(--cardhouse-control-top, max(8px, env(safe-area-inset-top)));
  opacity: 0.9;
  min-width: 0;
  min-height: 0;
  width: var(--cardhouse-control-height, 44px);
  height: var(--cardhouse-control-height, 44px);
  padding: 0;
  display: grid;
  place-items: center;
  line-height: 1;
}
#cardhouse-shell .ch-fab svg { width: 58%; height: 58%; display: block; }
#cardhouse-shell .ch-fab::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  min-width: 44px;
  min-height: 44px;
  transform: translate(-50%, -50%);
}
#cardhouse-shell .ch-toast {
  position: fixed;
  z-index: 10;
  left: max(8px, env(safe-area-inset-left));
  top: calc(max(8px, env(safe-area-inset-top)) + 52px);
  box-sizing: border-box;
  max-width: min(320px, 60vw);
  padding: 10px 12px;
  border: 2px solid #e6c27a;
  background: #0b2418;
}
`;

export interface MobileShell {
  refresh(): void;
  view(): ShellView;
  destroy(): void;
}

export interface MobileShellOptions {
  win?: Window;
  doc?: Document;
  /** Runs after the view recomputes, for example to re-fit the canvas. */
  onChange?: (view: ShellView) => void;
}

export function mountMobileShell(
  options: MobileShellOptions = {},
): MobileShell {
  const win = options.win ?? window;
  const doc = options.doc ?? document;
  const style = doc.createElement('style');
  style.dataset.cardhouseShell = 'style';
  style.textContent = SHELL_CSS;
  doc.head.append(style);

  const root = doc.createElement('div');
  root.id = 'cardhouse-shell';
  root.innerHTML = `
    <div class="ch-gate" data-cardhouse-shell="gate" role="alertdialog" aria-label="${ROTATE_TITLE}" hidden>
      <div class="ch-gate-frame">
        <p class="ch-title">${ROTATE_TITLE}</p>
        <button type="button" class="ch-button" data-cardhouse-shell="gate-button">${FULLSCREEN_LABEL}</button>
        <p class="ch-note" data-cardhouse-shell="gate-note" hidden>${ADD_TO_HOME_NOTE}</p>
      </div>
    </div>
    <button type="button" class="ch-button ch-fab" data-cardhouse-shell="fab" aria-label="${FULLSCREEN_LABEL}" title="${FULLSCREEN_LABEL}" hidden><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M8 3H3V8M16 3H21V8M3 16V21H8M21 16V21H16"/></svg></button>
    <p class="ch-note ch-toast" data-cardhouse-shell="toast" hidden>${ADD_TO_HOME_NOTE}</p>
  `;
  doc.body.append(root);

  const part = <T extends HTMLElement>(name: string): T => {
    const node = root.querySelector(`[data-cardhouse-shell="${name}"]`);
    if (!node) {
      throw new Error(`missing shell part ${name}`);
    }
    return node as T;
  };
  const gate = part<HTMLElement>('gate');
  const gateButton = part<HTMLButtonElement>('gate-button');
  const gateNote = part<HTMLElement>('gate-note');
  const fab = part<HTMLButtonElement>('fab');
  const toast = part<HTMLElement>('toast');

  let current = shellView(readShellInputs(win, doc));
  let noteOpen = false;

  const render = (): void => {
    current = shellView(readShellInputs(win, doc));
    if (!current.button || current.action !== 'add-to-home') {
      noteOpen = false;
    }
    gate.hidden = !current.gate;
    gateButton.hidden = !current.button;
    gateNote.hidden = !(current.gate && noteOpen);
    fab.hidden = current.gate || !current.button;
    toast.hidden = !(!current.gate && noteOpen);
    if (current.gate) {
      const active = doc.activeElement;
      if (active instanceof HTMLElement && active.dataset.cardhouseField) {
        active.blur();
      }
    }
    options.onChange?.(current);
  };

  const press = (): void => {
    if (current.action === 'fullscreen') {
      void enterFullscreen(doc).then(render);
      return;
    }
    noteOpen = !noteOpen;
    render();
  };
  gateButton.addEventListener('click', press);
  fab.addEventListener('click', press);

  const queries: MediaQueryLike[] = [
    MOBILE_QUERY,
    STANDALONE_QUERY,
    FULLSCREEN_QUERY,
  ].flatMap((query) => {
    const list = win.matchMedia?.(query);
    return list ? [list] : [];
  });
  for (const query of queries) {
    query.addEventListener?.('change', render);
  }
  win.addEventListener('resize', render);
  win.addEventListener('orientationchange', render);
  win.visualViewport?.addEventListener('resize', render);
  doc.addEventListener('fullscreenchange', render);
  render();

  return {
    refresh: render,
    view: () => current,
    destroy() {
      for (const query of queries) {
        query.removeEventListener?.('change', render);
      }
      win.removeEventListener('resize', render);
      win.removeEventListener('orientationchange', render);
      win.visualViewport?.removeEventListener('resize', render);
      doc.removeEventListener('fullscreenchange', render);
      root.remove();
      style.remove();
    },
  };
}
