// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { applyCodeText, applyFieldText } from './lobby';
import { applyChatText } from './table-chat';
import {
  bindCanvasTextField,
  eventTargetsHtmlField,
  logicalBoxToScreen,
  refreshCanvasTextFields,
  screenToLogical,
  type CanvasTextFieldHandle,
} from './html-field';

const handles: CanvasTextFieldHandle[] = [];

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
    expect(
      eventTargetsHtmlField({ target: input } as unknown as Event),
    ).toBe(true);
  });

  it('focuses the field under a tap so a touch keyboard can open', () => {
    mountCanvas();
    let focused = '';
    handles.push(
      bindCanvasTextField({
        id: 'asleep',
        label: 'Asleep',
        box: { x: 0, y: 0, w: 40, h: 20 },
        maxLength: 8,
        active: () => false,
        read: () => '',
        sanitize: (next) => next,
        write: () => {},
        submit: () => {},
        onFocus: () => {
          focused = 'asleep';
        },
      }),
    );
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
        onFocus: () => {
          focused = 'name';
        },
      }),
    );
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    canvas?.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: 110,
        clientY: 90,
        pointerId: 1,
        pointerType: 'touch',
      }),
    );
    const input = document.querySelector('input[data-cardhouse-field="name"]');
    expect(document.activeElement).toBe(input);
    expect(focused).toBe('name');
    expect(
      (input as HTMLInputElement | null)?.getAttribute('aria-hidden'),
    ).toBeNull();
    refreshCanvasTextFields();
    const asleep = document.querySelector(
      'input[data-cardhouse-field="asleep"]',
    );
    expect(asleep).toBeInstanceOf(HTMLInputElement);
    if (asleep instanceof HTMLInputElement) {
      expect(asleep.getAttribute('aria-hidden')).toBe('true');
      expect(asleep.style.pointerEvents).toBe('none');
    }
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
});
