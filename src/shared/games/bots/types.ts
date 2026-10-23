/**
 * One policy per game. The runner asks who must act, then plays bot seats
 * through the same `applyIntent` path a person uses.
 */
export interface BotStrategy<State, Intent> {
  gameType: string;
  actingSeats(state: State): number[];
  choose(state: State, seatIndex: number): Intent;
}
