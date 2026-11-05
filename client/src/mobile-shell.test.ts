// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADD_TO_HOME_NOTE,
  MOBILE_QUERY,
  ROTATE_TITLE,
  STANDALONE_QUERY,
  enterFullscreen,
  isIphoneAgent,
  isMobileDevice,
  isPortrait,
  installGameGestureGuard,
  mountMobileShell,
  readShellInputs,
  shellView,
  type MobileShell,
  type ShellInputs,
} from './mobile-shell';

describe('game gesture guard', () => {
  it('blocks phone pinch gestures but preserves single-finger input and cleans up', () => {
    const remove = installGameGestureGuard(document, () => true);
    const gesture = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(true);
    const move = (count: number): Event => {
      const event = new Event('touchmove', { cancelable: true });
      Object.defineProperty(event, 'touches', { value: Array(count).fill({}) });
      document.dispatchEvent(event);
      return event;
    };
    expect(move(1).defaultPrevented).toBe(false);
    expect(move(2).defaultPrevented).toBe(true);
    remove();
    expect(move(2).defaultPrevented).toBe(false);
  });

  it('leaves desktop browser gestures alone', () => {
    const remove = installGameGestureGuard(document, () => false);
    const event = new Event('gesturechange', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    remove();
  });
});

const PHONE: ShellInputs = {
  mobile: true,
  width: 390,
  height: 844,
  fullscreen: false,
  standalone: false,
  canFullscreen: true,
  iphone: false,
};

const LANDSCAPE: ShellInputs = { ...PHONE, width: 844, height: 390 };

describe('mobile detection', () => {
  const win = (queries: Record<string, boolean>) => ({
    matchMedia: (query: string) => ({ matches: queries[query] === true }),
    innerWidth: 390,
    innerHeight: 844,
    visualViewport: null,
    navigator: { userAgent: '' } as Navigator,
  });

  it('needs a coarse pointer and no hover', () => {
    expect(isMobileDevice(win({ [MOBILE_QUERY]: true }))).toBe(true);
    expect(isMobileDevice(win({}))).toBe(false);
  });

  it('keeps a narrow desktop window on the desktop layout', () => {
    const narrow = { ...win({}), innerWidth: 360, innerHeight: 800 };
    const inputs = readShellInputs(narrow as never, document);
    expect(inputs.mobile).toBe(false);
    expect(shellView(inputs)).toMatchObject({ gate: false, button: false });
  });

  it('tells an iPhone from other agents', () => {
    expect(
      isIphoneAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe(true);
    expect(isIphoneAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(
      false,
    );
    expect(
      isIphoneAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'),
    ).toBe(false);
  });

  it('reads standalone and fullscreen from the display mode', () => {
    const inputs = readShellInputs(
      win({ [MOBILE_QUERY]: true, [STANDALONE_QUERY]: true }) as never,
      document,
    );
    expect(inputs.standalone).toBe(true);
    expect(inputs.fullscreen).toBe(false);
  });
});

describe('portrait gate', () => {
  it('is portrait when taller than wide', () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
  });

  it('covers a portrait phone and offers fullscreen', () => {
    expect(shellView(PHONE)).toEqual({
      gate: true,
      button: true,
      action: 'fullscreen',
    });
  });

  it('shows the game and a small button in landscape', () => {
    expect(shellView(LANDSCAPE)).toEqual({
      gate: false,
      button: true,
      action: 'fullscreen',
    });
  });

  it('drops the button once the browser is fullscreen', () => {
    expect(shellView({ ...LANDSCAPE, fullscreen: true }).button).toBe(false);
  });

  it('hides the button for an installed web app', () => {
    expect(shellView({ ...LANDSCAPE, standalone: true }).button).toBe(false);
    expect(shellView({ ...PHONE, standalone: true })).toMatchObject({
      gate: true,
      button: false,
    });
  });

  it('points an iPhone at Add to Home Screen instead of fullscreen', () => {
    expect(
      shellView({ ...LANDSCAPE, iphone: true, canFullscreen: false }).action,
    ).toBe('add-to-home');
  });
});

describe('fullscreen button', () => {
  let shell: MobileShell | undefined;
  const original = {
    matchMedia: Object.getOwnPropertyDescriptor(window, 'matchMedia'),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  };

  afterEach(() => {
    shell?.destroy();
    shell = undefined;
    if (original.matchMedia) {
      Object.defineProperty(window, 'matchMedia', original.matchMedia);
    }
    window.innerWidth = original.innerWidth;
    window.innerHeight = original.innerHeight;
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    Reflect.deleteProperty(window.navigator, 'standalone');
  });

  function setup(options: {
    mobile: boolean;
    width: number;
    height: number;
    requestFullscreen?: () => Promise<void>;
  }): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: options.mobile && query === MOBILE_QUERY,
      }),
    });
    window.innerWidth = options.width;
    window.innerHeight = options.height;
    if (options.requestFullscreen) {
      Object.defineProperty(document.documentElement, 'requestFullscreen', {
        configurable: true,
        value: options.requestFullscreen,
      });
    }
  }

  const part = (name: string): HTMLElement | null =>
    document.querySelector(`[data-cardhouse-shell="${name}"]`);

  it('covers the game with the rotate panel in portrait', () => {
    setup({ mobile: true, width: 390, height: 844 });
    shell = mountMobileShell();
    expect(part('gate')?.hidden).toBe(false);
    expect(part('gate')?.textContent).toContain(ROTATE_TITLE);
    expect(part('gate-button')?.hidden).toBe(false);
    expect(part('fab')?.hidden).toBe(true);
  });

  it('shows only the small button in landscape', () => {
    setup({ mobile: true, width: 844, height: 390 });
    shell = mountMobileShell();
    expect(part('gate')?.hidden).toBe(true);
    expect(part('fab')?.hidden).toBe(false);
  });

  it('shows nothing on a desktop, even in a narrow window', () => {
    setup({ mobile: false, width: 360, height: 800 });
    shell = mountMobileShell();
    expect(part('gate')?.hidden).toBe(true);
    expect(part('fab')?.hidden).toBe(true);
    expect(part('toast')?.hidden).toBe(true);
  });

  it('follows a turn from portrait to landscape', () => {
    setup({ mobile: true, width: 390, height: 844 });
    shell = mountMobileShell();
    window.innerWidth = 844;
    window.innerHeight = 390;
    window.dispatchEvent(new Event('resize'));
    expect(part('gate')?.hidden).toBe(true);
    expect(part('fab')?.hidden).toBe(false);
  });

  it('enters fullscreen and then locks landscape', async () => {
    const order: string[] = [];
    setup({
      mobile: true,
      width: 844,
      height: 390,
      requestFullscreen: () => {
        order.push('fullscreen');
        return Promise.resolve();
      },
    });
    const lock = vi.fn((orientation: string) => {
      order.push(`lock:${orientation}`);
      return Promise.resolve();
    });
    Object.defineProperty(screen, 'orientation', {
      configurable: true,
      value: { lock },
    });
    shell = mountMobileShell();
    part('fab')?.click();
    await vi.waitFor(() => {
      expect(order).toEqual(['fullscreen', 'lock:landscape']);
    });
    Reflect.deleteProperty(screen, 'orientation');
  });

  it('does not lock when fullscreen is refused', async () => {
    const lock = vi.fn(() => Promise.resolve());
    const ok = await enterFullscreen(
      {
        documentElement: {
          requestFullscreen: () => Promise.reject(new Error('no')),
        },
      } as unknown as Document,
      { orientation: { lock } },
    );
    expect(ok).toBe(false);
    expect(lock).not.toHaveBeenCalled();
  });

  it('keeps the rotate panel on an upright iPhone and explains Add to Home Screen', () => {
    setup({ mobile: true, width: 390, height: 844 });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    try {
      shell = mountMobileShell();
      expect(part('gate-note')?.hidden).toBe(true);
      part('gate-button')?.click();
      expect(part('gate')?.hidden).toBe(false);
      expect(part('gate-note')?.hidden).toBe(false);
      expect(part('gate-note')?.textContent).toBe(ADD_TO_HOME_NOTE);
      expect(ADD_TO_HOME_NOTE).toContain('Share');
      expect(ADD_TO_HOME_NOTE).toContain('Add to Home Screen');
    } finally {
      Reflect.deleteProperty(window.navigator, 'userAgent');
    }
  });

  it('hides the button on an iPhone web app', () => {
    setup({ mobile: true, width: 844, height: 390 });
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });
    shell = mountMobileShell();
    expect(part('fab')?.hidden).toBe(true);
    expect(part('gate')?.hidden).toBe(true);
  });
});
