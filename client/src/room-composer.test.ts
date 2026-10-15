import { describe, expect, it } from 'vitest';
import { createRoomComposer } from './room-composer';

describe('room composer', () => {
  it('gives the keyboard to the field that was focused last', () => {
    const composer = createRoomComposer();
    composer.focus('name');
    expect(composer.active()).toBe('name');
    composer.focus('chat');
    expect(composer.active()).toBe('chat');
    composer.focus('name');
    expect(composer.active()).toBe('name');
  });

  it('clears only the field that blurs', () => {
    const composer = createRoomComposer();
    composer.focus('name');
    composer.blur('chat');
    expect(composer.active()).toBe('name');
    composer.blur('name');
    expect(composer.active()).toBeUndefined();
  });

  it('tells both fields when the owner changes', () => {
    const composer = createRoomComposer();
    const seen: Array<string | undefined> = [];
    composer.watch(() => {
      seen.push(composer.active());
    });
    composer.focus('name');
    composer.focus('name');
    composer.focus('chat');
    composer.clear();
    expect(seen).toEqual(['name', 'chat', undefined]);
  });
});
