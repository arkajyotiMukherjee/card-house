import { Actor, vec, type PointerEvent } from 'excalibur';
import { expect, it, vi } from 'vitest';
import { bindButtonPress } from './button-press';

it('rejects queued card slides and only activates a complete press on the button', () => {
  const actor = new Actor({ width: 64, height: 64 });
  const activate = vi.fn();
  const press = vi.fn();
  const reset = vi.fn();
  bindButtonPress(actor, press, reset, activate);

  const inside = { worldPos: vec(0, 0), pointerId: 1 } as PointerEvent;
  const outside = { ...inside, worldPos: vec(100, 0) } as PointerEvent;
  actor.emit('pointerdown', outside);
  actor.emit('pointerup', inside);
  expect(press).not.toHaveBeenCalled();

  actor.emit('pointerdown', inside);
  actor.emit('pointerup', { ...inside, pointerId: 2 } as PointerEvent);
  actor.emit('pointercancel', inside);
  actor.emit('pointerup', inside);
  expect(activate).not.toHaveBeenCalled();
  expect(reset).toHaveBeenCalledTimes(1);

  actor.emit('pointerdown', inside);
  actor.emit('pointerup', inside);
  expect(activate).toHaveBeenCalledExactlyOnceWith(inside);
});
