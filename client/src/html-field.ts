import { isMobileDevice } from './mobile-shell';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';

export const CARET_GOLD = '#f2c14e';

/** Room kept between the focused box and the top of the keyboard. */
export const KEYBOARD_MARGIN = 12;

/**
 * A phone or tablet only shows its on-screen keyboard for a real HTML input
 * that the browser focuses during a tap. Excalibur hears physical keys on the
 * window, and those events never arrive from an on-screen keyboard.
 *
 * Each canvas text box gets an input laid over that box while the box can be
 * typed in. The input's text is transparent, so the pixel label on the canvas
 * stays the visible value. `input` events copy the sanitized string back onto
 * that label. Physical keys type into the same input once it is focused, and
 * the keydown does not bubble, so the canvas handler does not insert the
 * character a second time.
 *
 * The input stays `opacity: 1` with a real size. iOS Safari will not open the
 * keyboard for `display: none`, `visibility: hidden`, or `opacity: 0`.
 * `font-size: 16px` keeps iOS from zooming the page. The caret is gold so the
 * player can see where typing lands; the pixel label stays the text they read.
 * This does not touch the canvas, its pixel filtering, or antialiasing.
 *
 * iOS opens the keyboard only when the finger lands on the input itself, in
 * the same gesture. So the input is already on the box (pointer events on)
 * before the tap, and nothing focuses it later from a canvas `pointerup`.
 * On a phone or tablet the scenes' `focus()` only places the input; a desktop
 * keeps the programmatic focus so physical keys type at once.
 *
 * Focus is plain `focus()`, not `preventScroll`. Once the keyboard is up the
 * visual viewport shrinks, and `keyboardLift` slides the canvas and the inputs
 * up so the focused box stays above it.
 */

export interface LogicalBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ElementRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type FieldMoveKey = 'Tab' | 'ArrowUp' | 'ArrowDown';

export type FieldEnterHint = 'done' | 'go' | 'next' | 'send';

export type FieldCapitalize = 'off' | 'none' | 'characters' | 'words';

export interface CanvasTextField {
  id: string;
  label: string;
  box: LogicalBox;
  maxLength: number;
  active: () => boolean;
  read: () => string;
  sanitize: (value: string) => string;
  write: (value: string) => void;
  submit: () => void;
  cancel?: () => void;
  /** Return true when the key moved focus and the browser should ignore it. */
  move?: (key: FieldMoveKey, shift: boolean) => boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  enterKeyHint?: FieldEnterHint | (() => FieldEnterHint);
  autoCapitalize?: FieldCapitalize;
}

export interface CanvasTextFieldHandle {
  sync(): void;
  focus(): void;
  refresh(): void;
  close(): void;
}

const NOOP_HANDLE: CanvasTextFieldHandle = {
  sync() {},
  focus() {},
  refresh() {},
  close() {},
};

interface FieldEntry {
  field: CanvasTextField;
  input: HTMLInputElement;
  composing: boolean;
  placedKey: string;
  close: () => void;
}

const fields: FieldEntry[] = [];
let installed = false;
let styleInstalled = false;
let lift = 0;
let loopHandle = 0;

export function logicalBoxToScreen(
  canvasRect: ElementRect,
  box: LogicalBox,
  logicalWidth = LOGICAL_WIDTH,
  logicalHeight = LOGICAL_HEIGHT,
): ScreenBox {
  if (
    canvasRect.width <= 0 ||
    canvasRect.height <= 0 ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scaleX = canvasRect.width / logicalWidth;
  const scaleY = canvasRect.height / logicalHeight;
  return {
    left: canvasRect.left + box.x * scaleX,
    top: canvasRect.top + box.y * scaleY,
    width: box.w * scaleX,
    height: box.h * scaleY,
  };
}

export function screenToLogical(
  canvasRect: ElementRect,
  clientX: number,
  clientY: number,
  logicalWidth = LOGICAL_WIDTH,
  logicalHeight = LOGICAL_HEIGHT,
): { x: number; y: number } {
  if (
    canvasRect.width <= 0 ||
    canvasRect.height <= 0 ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    return { x: Number.NaN, y: Number.NaN };
  }
  const scaleX = canvasRect.width / logicalWidth;
  const scaleY = canvasRect.height / logicalHeight;
  return {
    x: (clientX - canvasRect.left) / scaleX,
    y: (clientY - canvasRect.top) / scaleY,
  };
}

export function eventTargetsHtmlField(event: Event | undefined): boolean {
  const target = event?.target;
  if (!target || typeof target !== 'object' || !('dataset' in target)) {
    return false;
  }
  const id = (target as HTMLElement).dataset?.cardhouseField;
  return typeof id === 'string' && id.length > 0;
}

export function refreshCanvasTextFields(): void {
  if (!domReady()) {
    return;
  }
  for (const entry of fields) {
    placeField(entry);
  }
}

export function bindCanvasTextField(
  field: CanvasTextField,
): CanvasTextFieldHandle {
  if (!domReady()) {
    return NOOP_HANDLE;
  }
  install();
  const input = document.createElement('input');
  input.type = 'text';
  input.tabIndex = -1;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = field.maxLength;
  input.className = 'cardhouse-field';
  input.dataset.cardhouseField = field.id;
  input.setAttribute('name', `cardhouse-${field.id}`);
  input.setAttribute('inputmode', 'text');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('aria-label', field.label);
  input.enterKeyHint = enterHint(field);
  input.autocapitalize = field.autoCapitalize ?? 'off';
  document.body.append(input);

  const entry: FieldEntry = {
    field,
    input,
    composing: false,
    placedKey: '',
    close() {},
  };

  const commit = (caret: 'keep' | 'end'): void => {
    const next = field.sanitize(input.value);
    assignValue(input, next, caret);
    if (next !== field.read()) {
      field.write(next);
    }
  };

  input.addEventListener('compositionstart', () => {
    entry.composing = true;
  });
  input.addEventListener('compositionend', () => {
    entry.composing = false;
    commit('keep');
  });
  input.addEventListener('input', () => {
    if (entry.composing) {
      if (input.value !== field.read()) {
        field.write(input.value);
      }
      return;
    }
    commit('keep');
  });
  input.addEventListener('keydown', (event) => {
    onFieldKey(entry, event);
  });
  input.addEventListener('focus', () => {
    if (!field.active()) {
      return;
    }
    assignValue(input, field.sanitize(field.read()), 'end');
    field.onFocus?.();
    updateLift();
    window.setTimeout(updateLift, 350);
  });
  input.addEventListener('blur', () => {
    queueMicrotask(() => {
      if (document.activeElement === input) {
        return;
      }
      field.onBlur?.();
      if (!canvasFieldFocused()) {
        setLift(0);
      }
    });
  });
  // The finger is already on the input, so the browser focuses it natively.
  // This is a same-gesture fallback and does not cancel the tap.
  input.addEventListener('touchend', () => {
    if (field.active() && document.activeElement !== input) {
      input.focus();
    }
  });

  entry.close = () => {
    const index = fields.indexOf(entry);
    if (index >= 0) {
      fields.splice(index, 1);
    }
    if (document.activeElement === input) {
      input.blur();
    }
    input.remove();
  };
  fields.push(entry);
  placeField(entry);
  startLoop();

  return {
    sync() {
      assignValue(input, field.sanitize(field.read()), 'end');
    },
    focus() {
      placeField(entry);
      if (!field.active()) {
        return;
      }
      if (isMobileDevice()) {
        return;
      }
      input.focus();
    },
    refresh() {
      placeField(entry);
    },
    close() {
      entry.close();
    },
  };
}

function onFieldKey(entry: FieldEntry, event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  if (event.isComposing || entry.composing) {
    event.stopPropagation();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    const next = entry.field.sanitize(entry.input.value);
    assignValue(entry.input, next, 'end');
    if (next !== entry.field.read()) {
      entry.field.write(next);
    }
    entry.field.submit();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    entry.field.cancel?.();
    return;
  }
  if (
    event.key === 'Tab' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown'
  ) {
    const handled = entry.field.move?.(event.key, event.shiftKey) ?? false;
    if (handled) {
      event.preventDefault();
    }
    event.stopPropagation();
    return;
  }
  event.stopPropagation();
}

function placeField(entry: FieldEntry): void {
  const { field, input } = entry;
  if (!field.active()) {
    entry.placedKey = 'off';
    hideField(input);
    return;
  }
  const canvas = gameCanvas();
  if (!canvas) {
    entry.placedKey = 'off';
    hideField(input);
    return;
  }
  const screen = logicalBoxToScreen(canvas.getBoundingClientRect(), field.box);
  if (screen.width <= 0 || screen.height <= 0) {
    entry.placedKey = 'off';
    hideField(input);
    return;
  }
  entry.placedKey = placementKey(entry, screen);
  input.style.pointerEvents = 'auto';
  input.style.left = `${screen.left}px`;
  input.style.top = `${screen.top}px`;
  input.style.width = `${screen.width}px`;
  input.style.height = `${screen.height}px`;
  input.removeAttribute('aria-hidden');
  input.enterKeyHint = enterHint(field);
  input.autocapitalize = field.autoCapitalize ?? 'off';
  input.setAttribute('aria-label', field.label);
  if (document.activeElement !== input) {
    assignValue(input, field.sanitize(field.read()), 'end');
  }
}

function hideField(input: HTMLInputElement): void {
  input.style.pointerEvents = 'none';
  input.style.left = '-10000px';
  input.style.top = '0px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.setAttribute('aria-hidden', 'true');
  if (document.activeElement === input) {
    input.blur();
  }
}

function enterHint(field: CanvasTextField): FieldEnterHint {
  const hint = field.enterKeyHint;
  if (typeof hint === 'function') {
    return hint();
  }
  return hint ?? 'done';
}

function assignValue(
  input: HTMLInputElement,
  next: string,
  caret: 'keep' | 'end',
): void {
  const same = input.value === next;
  const end = next.length;
  let start = end;
  let finish = end;
  if (!same && caret === 'keep') {
    start = Math.min(input.selectionStart ?? end, end);
    finish = Math.min(input.selectionEnd ?? end, end);
  }
  if (!same) {
    input.value = next;
  } else if (caret !== 'end') {
    return;
  }
  if (document.activeElement !== input) {
    return;
  }
  try {
    input.setSelectionRange(start, finish);
  } catch {
    // Some input types refuse a selection until they are focused.
  }
}

function placementKey(entry: FieldEntry, screen: ScreenBox): string {
  return [
    screen.left,
    screen.top,
    screen.width,
    screen.height,
    enterHint(entry.field),
    entry.field.autoCapitalize ?? 'off',
  ].join('|');
}

/**
 * Keeps every input on its box. A scene turns a field on or off with no call
 * into this module, and an input left on a closed box would swallow taps meant
 * for the canvas. Runs a frame at a time and only touches the DOM on change.
 */
function syncFields(): void {
  loopHandle = 0;
  if (fields.length === 0) {
    return;
  }
  const canvas = gameCanvas();
  const rect = canvas?.getBoundingClientRect();
  for (const entry of fields) {
    const { field } = entry;
    if (!field.active() || !rect) {
      if (entry.placedKey !== 'off') {
        placeField(entry);
      }
      continue;
    }
    const screen = logicalBoxToScreen(rect, field.box);
    if (entry.placedKey !== placementKey(entry, screen)) {
      placeField(entry);
    }
  }
  loopHandle = requestAnimationFrame(syncFields);
}

function startLoop(): void {
  if (loopHandle !== 0 || typeof requestAnimationFrame !== 'function') {
    return;
  }
  loopHandle = requestAnimationFrame(syncFields);
}

function install(): void {
  if (installed || !domReady()) {
    return;
  }
  installed = true;
  installStyle();
  window.addEventListener('resize', () => {
    requestAnimationFrame(() => {
      updateLift();
      refreshCanvasTextFields();
    });
  });
  const viewport = window.visualViewport;
  if (viewport) {
    const onViewport = (): void => {
      requestAnimationFrame(() => {
        updateLift();
        refreshCanvasTextFields();
      });
    };
    viewport.addEventListener('resize', onViewport);
    viewport.addEventListener('scroll', onViewport);
  }
}

export interface KeyboardViewport {
  offsetTop: number;
  height: number;
}

/**
 * How far to slide the page up so a focused box sits above the keyboard.
 * `box` is where the field sits with no lift. The result is never negative
 * and never pushes the top of the box above the visible area.
 */
export function keyboardLift(
  box: { top: number; bottom: number },
  viewport: KeyboardViewport,
  margin = KEYBOARD_MARGIN,
): number {
  const visibleBottom = viewport.offsetTop + viewport.height - margin;
  const needed = box.bottom - visibleBottom;
  if (needed <= 0) {
    return 0;
  }
  const room = box.top - viewport.offsetTop;
  return Math.max(0, Math.min(needed, room));
}

function canvasFieldFocused(): boolean {
  return fields.some((entry) => document.activeElement === entry.input);
}

export function isCanvasFieldFocused(): boolean {
  return domReady() && canvasFieldFocused();
}

function setLift(next: number): void {
  const rounded = Math.round(next);
  if (rounded === lift) {
    return;
  }
  lift = rounded;
  const host = gameCanvas()?.parentElement;
  if (host) {
    host.style.transform = lift > 0 ? `translate3d(0, ${-lift}px, 0)` : '';
  }
  refreshCanvasTextFields();
}

function updateLift(): void {
  if (!domReady()) {
    return;
  }
  const focused = fields.find(
    (entry) => document.activeElement === entry.input,
  );
  const viewport = window.visualViewport;
  if (!focused || !viewport) {
    setLift(0);
    return;
  }
  const canvas = gameCanvas();
  if (!canvas) {
    setLift(0);
    return;
  }
  const screen = logicalBoxToScreen(
    canvas.getBoundingClientRect(),
    focused.field.box,
  );
  setLift(
    keyboardLift(
      { top: screen.top + lift, bottom: screen.top + screen.height + lift },
      { offsetTop: viewport.offsetTop, height: viewport.height },
    ),
  );
}

function installStyle(): void {
  if (styleInstalled) {
    return;
  }
  styleInstalled = true;
  const style = document.createElement('style');
  style.dataset.cardhouseField = 'style';
  style.textContent = [
    '.cardhouse-field {',
    '  position: fixed;',
    '  z-index: 6;',
    '  margin: 0;',
    '  padding: 0;',
    '  border: 0;',
    '  outline: none;',
    '  background: transparent;',
    '  color: transparent;',
    `  caret-color: ${CARET_GOLD};`,
    "  font-family: 'Press Start 2P', monospace;",
    '  font-size: 16px;',
    '  line-height: normal;',
    '  opacity: 1;',
    '  border-radius: 0;',
    '  box-sizing: border-box;',
    '  -webkit-appearance: none;',
    '  appearance: none;',
    '  -webkit-tap-highlight-color: transparent;',
    '  touch-action: manipulation;',
    '}',
  ].join('\n');
  document.head.append(style);
}

function gameCanvas(): HTMLCanvasElement | undefined {
  const scoped = document.querySelector('#app canvas');
  if (scoped instanceof HTMLCanvasElement) {
    return scoped;
  }
  const canvas = document.querySelector('canvas');
  return canvas instanceof HTMLCanvasElement ? canvas : undefined;
}

function domReady(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.body !== null &&
    document.body !== undefined &&
    typeof document.body.appendChild === 'function' &&
    typeof document.createElement === 'function'
  );
}
