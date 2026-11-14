import type { Actor, Scene } from 'excalibur';
import { anchorTableActor, tableGutter } from './table-viewport';

const lobbies = new WeakSet<Scene>();
const stretches = new WeakMap<Actor, number>();
export function enableLobbyViewport(scene: Scene): void {
  lobbies.add(scene);
  for (const actor of scene.actors) {
    if (actor.width === 645 && actor.height === 400)
      actor.graphics.isVisible = false;
  }
}
export function isLobbyViewport(scene: Scene): boolean {
  return lobbies.has(scene);
}
/** Outer columns sit against the safe edges; the table list gets the extra width. */
export function anchorLobbyActor(actor: Actor, x = actor.pos.x): void {
  anchorTableActor(actor, x >= 650 ? 'right' : 'left', x);
}
export function stretchLobbyActor(actor: Actor, width: number): void {
  stretches.set(actor, width);
  const graphic = actor.graphics.current;
  if (graphic) graphic.width = width + tableGutter() * 2;
}
export function placeLobbyWidths(scene: Scene): void {
  const visit = (actor: Actor): void => {
    const width = stretches.get(actor);
    if (width !== undefined && actor.graphics.current)
      actor.graphics.current.width = width + tableGutter() * 2;
    for (const child of actor.children) visit(child as Actor);
  };
  for (const actor of scene.actors) {
    if (actor.z === 0 && actor.pos.x === 480 && actor.pos.y === 286)
      actor.graphics.isVisible = false;
    visit(actor);
  }
}
export function lobbyFieldGeometry<T extends { x: number }>(
  box: T,
  edge: 'left' | 'right',
): T {
  return {
    ...box,
    get x() {
      return box.x + (edge === 'left' ? -tableGutter() : tableGutter());
    },
  };
}
