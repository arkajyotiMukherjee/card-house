import type { CardFace } from './card-atlas';

export interface IdleCard {
  x: number;
  y: number;
  card: CardFace | 'back';
  /** Resting tilt in radians. */
  tilt: number;
  /** Offsets each card so the fan does not move in lockstep. */
  phase: number;
}

export interface IdlePose {
  x: number;
  y: number;
  rotation: number;
}

/** Cards that rest on the felt around the table silhouette, clear of both side panels. */
export const IDLE_CARDS: readonly IdleCard[] = [
  { x: 230, y: 150, card: 'back', tilt: -0.28, phase: 0 },
  {
    x: 268,
    y: 160,
    card: { rank: 'K', suit: 'hearts' },
    tilt: -0.1,
    phase: 1.1,
  },
  {
    x: 700,
    y: 140,
    card: { rank: 'Q', suit: 'hearts' },
    tilt: 0.22,
    phase: 2.3,
  },
  { x: 660, y: 126, card: 'back', tilt: 0.06, phase: 3.4 },
  {
    x: 240,
    y: 440,
    card: { rank: '10', suit: 'hearts' },
    tilt: 0.18,
    phase: 4.2,
  },
  { x: 630, y: 446, card: 'back', tilt: -0.2, phase: 5.1 },
];

export const IDLE_OPACITY = 0.4;
export const IDLE_BOB_PIXELS = 4;
const BOB_PERIOD_MS = 3200;
const SWAY_PERIOD_MS = 5200;
const SWAY_RADIANS = 0.05;

/** Slow bob and sway. The bob is whole pixels so snapped sprites do not shimmer. */
export function idleCardPose(card: IdleCard, elapsedMs: number): IdlePose {
  const bob = Math.sin((elapsedMs / BOB_PERIOD_MS) * Math.PI * 2 + card.phase);
  const sway = Math.sin(
    (elapsedMs / SWAY_PERIOD_MS) * Math.PI * 2 + card.phase,
  );
  return {
    x: card.x,
    y: card.y + Math.round(bob * IDLE_BOB_PIXELS),
    rotation: card.tilt + sway * SWAY_RADIANS,
  };
}
