import type { CasinoAvatar } from '../../src/shared/casino-avatar';
import type { Scene } from 'excalibur';
import type { CardAtlas } from './card-atlas';

export interface DriverSeat {
  seatIndex: number;
  name: string;
  self: boolean;
  avatar?: CasinoAvatar;
  speaking?: boolean;
  x: number;
  y: number;
}

export interface RenderContext {
  scene: Scene;
  seats: readonly DriverSeat[];
  meSeatIndex: number | null;
  finishedMessage?: string;
  /** Entry-fee prize for non-casino games, in chips. */
  prizePool?: number;
  tableName?: string;
  /** Blackjack keeps its between-hand buy-in flow without using a prize pool. */
  houseGame?: { topUp?: () => void; nextHandAt?: number };
  navigation?: {
    leave: () => void;
    chat: () => void;
    help: () => void;
    chatAvailable: boolean;
  };
  /** Paid poker follows the server's session status and shared next-deal deadline. */
  cashGame?: {
    closed: boolean;
    nextHandAt?: number;
    topUp?: () => void;
  };
  /**
   * Card front and back for this browser. The table scene sets this to the
   * saved Theme, so the menu, the lobby, and every card on the table match.
   */
  cards: CardAtlas;
  /**
   * The local player's own front and back. The table scene uses the same
   * saved Theme here. Own-hand cards still pass `personal: true`.
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
  /** Optional public feedback, rendered by the game's own classic status area. */
  setAnnouncement?(text: string): void;
  /** The module rejected `intent`. Mark the controls that sent it. */
  intentRejected?(intent: unknown, ctx: RenderContext): void;
  destroy(ctx: RenderContext): void;
}
