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
  cards: CardAtlas;
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
  destroy(ctx: RenderContext): void;
}
