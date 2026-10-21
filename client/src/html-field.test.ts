// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { applyCodeText, applyFieldText } from './lobby';
import { applyChatText } from './table-chat';
import { PROMPT } from './menu-layout';
import {
  CARET_GOLD,
  KEYBOARD_MARGIN,
  bindCanvasTextField,
  eventTargetsHtmlField,
  keyboardLift,
  logicalBoxToScreen,
  refreshCanvasTextFields,
  screenToLogical,
  type CanvasTextFieldHandle,
} from './html-field';

const handles: CanvasTextFieldHandle[] = [];

function stubMobile(mobile: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile && query === '(pointer: coarse) and (hover: none)',
    }),
  });
  return () => {
    if (original) {
      Object.defineProperty(window, 'matchMedia', original);
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  };
}

afterEach(() => {
  for (const handle of handles) {
    handle.close();
  }
  handles.length = 0;
  document.querySelectorAll('canvas').forEach((node) => {
    node.remove();
  });
});

function mountCanvas(
  rect: { left: number; top: number; width: number; height: number } = {
    left: 0,
    top: 0,
    width: 960,
    height: 540,
  },
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  document.body.append(canvas);
  return canvas;
}

describe('logicalBoxToScreen', () => {
  it('maps a logical box through the canvas rectangle', () => {
    expect(
      logicalBoxToScreen(
        { left: 5, top: 7, width: 1920, height: 1080 },
        { x: 10, y: 20, w: 30, h: 40 },
      ),
    ).toEqual({ left: 25, top: 47, width: 60, height: 80 });
  });

  it('round-trips a point inside that box', () => {
    const canvasRect = { left: 5, top: 7, width: 1920, height: 1080 };
    const screen = logicalBoxToScreen(canvasRect, {
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    });
    expect(screenToLogical(canvasRect, screen.left, screen.top)).toEqual({
      x: 10,
      y: 20,
    });
  });
});

describe('canvas text field', () => {
  it('keeps a real input in sync with the value the canvas would draw', () => {
    mountCanvas();
    let value = 'Ada';
    const seen: string[] = [];
    const handle = bindCanvasTextField({
      id: 'menu-name',
      label: 'Your Name',
      box: { x: 10, y: 20, w: 100, h: 28 },
      maxLength: 12,
      active: () => true,
      read: () => value,
      sanitize: (next) => applyFieldText(next, 12),
      write: (next) => {
        value = next;
        seen.push(next);
      },
      submit: () => {},
    });
    handles.push(handle);
    const input = document.querySelector(
      'input[data-cardhouse-field="menu-name"]',
    );
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const style = getComputedStyle(input);
    expect(style.opacity).toBe('1');
    expect(style.fontSize).toBe('16px');
    expect(style.display).not.toBe('none');
    expect(style.visibility).not.toBe('hidden');
    expect(input.value).toBe('Ada');

    input.focus();
    input.value = 'Ada!';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(value).toBe('Ada');
    expect(input.value).toBe('Ada');
    expect(seen).toEqual([]);

    input.value = 'Ada B';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(value).toBe('Ada B');
    expect(input.value).toBe('Ada B');
    expect(seen).toEqual(['Ada B']);
  });

  it('uppercases a room code and keeps punctuation in chat', () => {
    mountCanvas();
    let code = '';
    let chat = '';
    handles.push(
      bindCanvasTextField({
        id: 'menu-code',
        label: 'Room Code',
        box: { x: 10, y: 60, w: 80, h: 28 },
        maxLength: 6,
        active: () => true,
        read: () => code,
        sanitize: (next) => applyCodeText(next),
        write: (next) => {
          code = next;
        },
        submit: () => {},
      }),
    );
    handles.push(
      bindCanvasTextField({
        id: 'table-chat',
        label: 'Chat',
        box: { x: 10, y: 100, w: 200, h: 28 },
        maxLength: 20,
        active: () => true,
        read: () => chat,
        sanitize: (next) => applyChatText(next, 20),
        write: (next) => {
          chat = next;
        },
        submit: () => {},
      }),
    );
    const codeInput = document.querySelector(
      'input[data-cardhouse-field="menu-code"]',
    );
    const chatInput = document.querySelector(
      'input[data-cardhouse-field="table-chat"]',
    );
    expect(codeInput).toBeInstanceOf(HTMLInputElement);
    expect(chatInput).toBeInstanceOf(HTMLInputElement);
    if (
      !(codeInput instanceof HTMLInputElement) ||
      !(chatInput instanceof HTMLInputElement)
    ) {
      return;
    }
    codeInput.value = 'ab c!';
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(code).toBe('ABC');
    expect(codeInput.value).toBe('ABC');
    chatInput.value = 'gg?\n';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(chat).toBe('gg?');
    expect(chatInput.value).toBe('gg?');
  });

  it('submits on Enter without letting the key reach the window', () => {
    mountCanvas();
    let submitted = 0;
    let cancelled = 0;
    handles.push(
      bindCanvasTextField({
        id: 'lobby-chat',
        label: 'Chat',
        box: { x: 0, y: 0, w: 40, h: 20 },
        maxLength: 20,
        active: () => true,
        read: () => 'hi',
        sanitize: (next) => next,
        write: () => {},
        submit: () => {
          submitted += 1;
        },
        cancel: () => {
          cancelled += 1;
        },
      }),
    );
    const input = document.querySelector('input');
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    let reachedWindow = 0;
    const onWindow = (): void => {
      reachedWindow += 1;
    };
    window.addEventListener('keydown', onWindow);
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    window.removeEventListener('keydown', onWindow);
    expect(submitted).toBe(1);
    expect(cancelled).toBe(1);
    expect(reachedWindow).toBe(0);
    expect(eventTargetsHtmlField({ target: input } as unknown as Event)).toBe(
      true,
    );
  });

  it('has the input under the finger before the tap, and a tap on it focuses it', () => {
    mountCanvas();
    let focused = '';
    let open = false;
    handles.push(
      bindCanvasTextField({
        id: 'menu-name',
        label: 'Your Name',
        box: PROMPT.nameField,
        maxLength: 12,
        active: () => open,
        read: () => 'Bea',
        sanitize: (next) => next,
        write: () => {},
        submit: () => {},
        onFocus: () => {
          focused = 'name';
        },
      }),
    );
    const input = document.querySelector(
      'input[data-cardhouse-field="menu-name"]',
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing input');
    }
    expect(input.style.pointerEvents).toBe('none');

    open = true;
    refreshCanvasTextFields();
    expect(input.style.pointerEvents).toBe('auto');
    expect(input.style.left).toBe(`${PROMPT.nameField.x}px`);
    expect(input.style.top).toBe(`${PROMPT.nameField.y}px`);
    expect(input.style.width).toBe(`${PROMPT.nameField.w}px`);
    expect(input.style.height).toBe(`${PROMPT.nameField.h}px`);
    expect(document.activeElement).not.toBe(input);

    input.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }),
    );
    input.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(document.activeElement).toBe(input);
    expect(focused).toBe('name');
    expect(input.getAttribute('aria-hidden')).toBeNull();
  });

  it('does not focus a field later from a canvas pointerup', () => {
    mountCanvas();
    handles.push(
      bindCanvasTextField({
        id: 'name',
        label: 'Your Name',
        box: { x: 100, y: 80, w: 120, h: 28 },
        maxLength: 12,
        active: () => true,
        read: () => 'Bea',
        sanitize: (next) => next,
        write: () => {},
        submit: () => {},
      }),
    );
    const canvas = document.querySelector('canvas');
    canvas?.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: 110,
        clientY: 90,
        pointerId: 1,
        pointerType: 'touch',
      }),
    );
    expect(document.activeElement).toBe(document.body);
  });

  it('hides an input whose box closed so it cannot swallow canvas taps', async () => {
    mountCanvas();
    let open = true;
    handles.push(
      bindCanvasTextField({
        id: 'name',
        label: 'Your Name',
        box: { x: 100, y: 80, w: 120, h: 28 },
        maxLength: 12,
        active: () => open,
        read: () => '',
        sanitize: (next) => next,
        write: () => {},
        submit: () => {},
      }),
    );
    const input = document.querySelector('input');
    expect(input?.style.pointerEvents).toBe('auto');
    open = false;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(input?.style.pointerEvents).toBe('none');
    expect(input?.getAttribute('aria-hidden')).toBe('true');
  });

  it('only places the input on a phone, and leaves focus to the tap', () => {
    mountCanvas();
    const restore = stubMobile(true);
    try {
      handles.push(
        bindCanvasTextField({
          id: 'name',
          label: 'Your Name',
          box: { x: 100, y: 80, w: 120, h: 28 },
          maxLength: 12,
          active: () => true,
          read: () => '',
          sanitize: (next) => next,
          write: () => {},
          submit: () => {},
        }),
      );
      handles[0]?.focus();
      const input = document.querySelector('input');
      expect(document.activeElement).not.toBe(input);
      expect(input?.style.pointerEvents).toBe('auto');
    } finally {
      restore();
    }
  });

  it('keeps programmatic focus on a desktop', () => {
    mountCanvas();
    handles.push(
      bindCanvasTextField({
        id: 'name',
        label: 'Your Name',
        box: { x: 100, y: 80, w: 120, h: 28 },
        maxLength: 12,
        active: () => true,
        read: () => '',
        sanitize: (next) => next,
        write: () => {},
        submit: () => {},
      }),
    );
    handles[0]?.focus();
    expect(document.activeElement).toBe(document.querySelector('input'));
  });

  it('sanitizes when a composition ends', () => {
    mountCanvas();
    let value = '';
    handles.push(
      bindCanvasTextField({
        id: 'compose',
        label: 'Your Name',
        box: { x: 0, y: 0, w: 80, h: 28 },
        maxLength: 12,
        active: () => true,
        read: () => value,
        sanitize: (next) => applyFieldText(next, 12),
        write: (next) => {
          value = next;
        },
        submit: () => {},
      }),
    );
    const input = document.querySelector('input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('missing input');
    }
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'A!';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(value).toBe('A!');
    expect(input.value).toBe('A!');
    input.dispatchEvent(new CompositionEvent('compositionend'));
    expect(value).toBe('A');
    expect(input.value).toBe('A');
  });

  it('draws a gold caret and keeps 16px text', () => {
    mountCanvas();
    handles.push(
      bindCanvasTextField({
        id: 'name',
        label: 'Your Name',
        box: { x: 0, y: 0, w: 80, h: 28 },
        maxLength: 12,
        active: () => true,
        read: () => '',
        sanitize: (next) => next,
        write: () => {},
        submit: () => {},
      }),
    );
    const input = document.querySelector('input');
    if (!input) {
      throw new Error('missing input');
    }
    const style = getComputedStyle(input);
    expect(style.caretColor).toBe(CARET_GOLD);
    expect(style.fontSize).toBe('16px');
    expect(style.color).toBe('transparent');
  });
});

describe('keyboard lift', () => {
  const viewport = { offsetTop: 0, height: 300 };

  it('leaves a box that is already above the keyboard', () => {
    expect(keyboardLift({ top: 100, bottom: 128 }, viewport)).toBe(0);
  });

  it('lifts a low box until it clears the keyboard by the margin', () => {
    expect(keyboardLift({ top: 400, bottom: 428 }, viewport)).toBe(
      428 - (300 - KEYBOARD_MARGIN),
    );
  });

  it('never pushes the box above the visible top', () => {
    expect(keyboardLift({ top: 20, bottom: 500 }, viewport)).toBe(20);
  });

  it('reads the visible area from the visual viewport offset', () => {
    expect(
      keyboardLift({ top: 400, bottom: 428 }, { offsetTop: 200, height: 300 }),
    ).toBe(0);
  });

  it('lifts the canvas host while an input is focused and the keyboard is up', () => {
    const canvas = mountCanvas();
    const host = document.createElement('div');
    document.body.append(host);
    host.append(canvas);
    const viewport = {
      width: 800,
      height: 200,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    try {
      handles.push(
        bindCanvasTextField({
          id: 'chat',
          label: 'Chat',
          box: { x: 0, y: 440, w: 300, h: 28 },
          maxLength: 20,
          active: () => true,
          read: () => '',
          sanitize: (next) => next,
          write: () => {},
          submit: () => {},
        }),
      );
      const input = document.querySelector('input');
      input?.focus();
      expect(host.style.transform).toContain('translate3d(0, -');
      input?.blur();
    } finally {
      Reflect.deleteProperty(window, 'visualViewport');
      host.remove();
    }
  });
});
