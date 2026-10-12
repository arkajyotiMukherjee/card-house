import { describe, expect, it } from 'vitest';
import { roomCodeFromPath } from './join-path';

describe('join path', () => {
  it('reads a four-character room code from the URL path', () => {
    expect(roomCodeFromPath('/AB3D')).toBe('AB3D');
    expect(roomCodeFromPath('/ab3d/')).toBe('AB3D');
  });

  it('ignores the menu and asset paths', () => {
    expect(roomCodeFromPath('/')).toBeUndefined();
    expect(roomCodeFromPath('/assets/cards-hearts.png')).toBeUndefined();
    expect(roomCodeFromPath('/IO01')).toBeUndefined();
    expect(roomCodeFromPath('/ABC')).toBeUndefined();
  });
});
