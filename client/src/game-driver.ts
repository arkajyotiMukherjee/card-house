import type { Scene } from 'excalibur';
import type { CardAtlas } from './card-atlas';

export interface DriverSeat {
  seatIndex: number;
  name: string;
  self: boolean;
  x: number;
  y: number;
}

export interface RenderContext {
  scene: Scene;
  seats: readonly DriverSeat[];
  meSeatIndex: number | null;
  /** Shared look: the table, piles, melds, and every other seat's cards and backs. */
  cards: CardAtlas;
  /**
   * The local player's own front and back style, from `card-appearance.ts`.
   * Only the cards still in this player's own hand read it; everything else
   * (including this player's own played or melded cards) stays on `cards`.
   */
  myCards: CardAtlas;
  sendIntent: (intent: unknown) => void;
  /** True while an overlay covers the table. Drivers ignore pointer input then. */
  inputBlocked: () => boolean;
}

export interface InputEvent {
  type: 'pointerdown' | 'pointerup' | 'pointerenter' | 'pointerleave';
  target: string;
}

export interface GameDriver<State> {
  name: string;
  gameType: string;
  render(state: State, ctx: RenderContext): void;
  handleInput(event: InputEvent, state: State, ctx: RenderContext): void;
  /** The module rejected `intent`. Mark the controls that sent it. */
  intentRejected?(intent: unknown, ctx: RenderContext): void;
  destroy(ctx: RenderContext): void;
}
