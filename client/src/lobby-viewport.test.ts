import { expect, it } from 'vitest';
import type { Actor, Scene } from 'excalibur';
import {
  anchorLobbyActor,
  lobbyFieldGeometry,
  stretchLobbyActor,
  placeLobbyWidths,
} from './lobby-viewport';
import { placeTableAnchors } from './table-viewport';

it('uses both gutters for tables while keeping sidebars and editable fields aligned', () => {
  const actor = (x: number) =>
    ({
      pos: { x, y: 80 },
      graphics: { current: { width: 432 } },
      children: [],
    }) as unknown as Actor;
  const players = actor(8),
    tables = actor(208),
    chat = actor(656);
  const scene = { actors: [players, tables, chat] } as unknown as Scene;
  placeTableAnchors(scene, 960);
  for (const item of scene.actors) anchorLobbyActor(item);
  stretchLobbyActor(tables, 432);
  const name = lobbyFieldGeometry({ x: 20, w: 160 }, 'left');
  const message = lobbyFieldGeometry({ x: 668, w: 200 }, 'right');
  placeTableAnchors(scene, 1200);
  placeLobbyWidths(scene);
  expect(players.pos.x).toBe(-112);
  expect(tables.pos.x).toBe(88);
  expect(chat.pos.x).toBe(776);
  expect(tables.graphics.current?.width).toBe(672);
  expect(name.x).toBe(-100);
  expect(message.x).toBe(788);
  expect(tables.pos.x + tables.graphics.current!.width).toBeLessThan(
    chat.pos.x,
  );
  placeTableAnchors(scene, 960);
  placeLobbyWidths(scene);
  expect(name.x).toBe(20);
  expect(tables.graphics.current?.width).toBe(432);
});
