import { expect, it } from 'vitest';
import type { Actor, Scene } from 'excalibur';
import {
  anchorTableActor,
  centeredFrameRect,
  placeTableAnchors,
  tableViewportWidth,
} from './table-viewport';

it('uses wide phone gutters without shrinking the table or distorting cards', () => {
  expect(tableViewportWidth(784, 390)).toBe(1085);
  expect(tableViewportWidth(872, 430)).toBe(1095);
  expect(tableViewportWidth(640, 360)).toBe(960);
  expect(tableViewportWidth(390, 844)).toBe(960);
  expect(tableViewportWidth(3000, 600)).toBe(1440);
});

it('keeps chrome on the edges across resizes and returns it to the base frame', () => {
  const left = { pos: { x: 8, y: 16 } } as Actor;
  const right = { pos: { x: 908, y: 16 } } as Actor;
  const table = { pos: { x: 480, y: 278 } } as Actor;
  const scene = { actors: [left, right, table] } as unknown as Scene;
  placeTableAnchors(scene, 960);
  anchorTableActor(left, 'left');
  anchorTableActor(right, 'right');
  placeTableAnchors(scene, 1200);
  expect(left.pos.x).toBe(-112);
  expect(right.pos.x).toBe(1028);
  expect(table.pos.x).toBe(480);
  placeTableAnchors(scene, 1080);
  expect(left.pos.x).toBe(-52);
  expect(right.pos.x).toBe(968);
  placeTableAnchors(scene, 960);
  expect(left.pos.x).toBe(8);
  expect(right.pos.x).toBe(908);
});

it('projects HTML fields onto the centered frame inside a wide table canvas', () => {
  const scene = { actors: [] } as unknown as Scene;
  placeTableAnchors(scene, 1200);
  expect(
    centeredFrameRect({ left: 60, top: 0, width: 900, height: 405 }),
  ).toEqual({ left: 150, top: 0, width: 720, height: 405 });
  placeTableAnchors(scene, 960);
  expect(
    centeredFrameRect({ left: 60, top: 0, width: 720, height: 405 }),
  ).toEqual({ left: 60, top: 0, width: 720, height: 405 });
});
