// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { BACKGROUND_HEX } from './theme';
import { applyPageBackground, PAGE_BACKGROUND_VAR } from './page-background';

describe('applyPageBackground', () => {
  it('paints the page behind the frame', () => {
    document.body.innerHTML = '<div id="app"></div>';
    applyPageBackground(BACKGROUND_HEX.purple, document);
    expect(
      document.documentElement.style.getPropertyValue(PAGE_BACKGROUND_VAR),
    ).toBe(BACKGROUND_HEX.purple);
    expect(document.documentElement.style.background).toBe(
      BACKGROUND_HEX.purple,
    );
    expect(document.body.style.background).toBe(BACKGROUND_HEX.purple);
    expect(document.querySelector('#app')?.getAttribute('style')).toContain(
      BACKGROUND_HEX.purple,
    );
  });
});
