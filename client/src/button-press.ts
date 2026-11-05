import type { Actor, PointerEvent } from 'excalibur';

/** Require a press and release from the same pointer inside the same target. */
export function bindButtonPress(
  actor: Actor,
  press: ((event: PointerEvent) => void) | undefined,
  reset: (() => void) | undefined,
  activate: (event: PointerEvent) => void,
): void {
  let pressedPointer: number | null = null;
  const cancel = (): void => {
    pressedPointer = null;
    reset?.();
  };
  actor.on('pointerleave', cancel);
  actor.on('pointercancel', cancel);
  actor.on('pointerdown', (event) => {
    // Excalibur can route a queued event by the frame's final pointer position.
    if (!actor.collider.bounds.contains(event.worldPos)) return;
    pressedPointer = event.pointerId;
    press?.(event);
  });
  actor.on('pointerup', (event) => {
    if (pressedPointer !== event.pointerId) return;
    cancel();
    if (actor.collider.bounds.contains(event.worldPos)) activate(event);
  });
}
