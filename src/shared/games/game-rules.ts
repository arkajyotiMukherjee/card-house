/**
 * Plain values the rules functions read.
 * The SpacetimeDB module keeps its own row types.
 */

export const TABLE_STATUSES = [
  'waiting_for_players',
  'in_progress',
  'finished',
] as const;

export type TableStatus = (typeof TABLE_STATUSES)[number];

export const SEAT_STATES = ['active', 'folded', 'disconnected'] as const;

export type SeatState = (typeof SEAT_STATES)[number];

export interface GameTable {
  id: string;
  lobbyId: string;
  gameType: string;
  name: string;
  status: TableStatus;
  minPlayers: number;
  maxPlayers: number;
  stateJson: string;
  createdAt: number;
}

export interface GameSeat {
  id: string;
  tableId: string;
  lobbyMemberId: string;
  seatIndex: number;
  chips: number | null;
  joinedAt: number;
  seatState: SeatState | null;
}

export interface IntentContext {
  seat: GameSeat;
  now: number;
}

export interface GameRules<State, Intent> {
  initialState(players: GameSeat[], table: GameTable): State;
  applyIntent(prev: State, intent: Intent, ctx: IntentContext): State;
  /**
   * A JSON-safe note about an accepted intent, stored on its `GameEvent`.
   * Clients turn it into the message strip text. `null` announces nothing.
   */
  eventNote?(
    prev: State,
    intent: Intent,
    next: State,
    ctx: IntentContext,
  ): unknown;
  onPlayerJoin?(prev: State, seat: GameSeat): State;
  onPlayerLeave?(prev: State, seat: GameSeat): State;
  isJoinAllowedDuringPhase?(state: State): boolean;
  isTableReadyToStart?(state: State): boolean;
}
