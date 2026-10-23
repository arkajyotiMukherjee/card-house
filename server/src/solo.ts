/** Display names for bot seats, in seat order after the human at seat 0. */
export const BOT_NAMES = [
  'Ada',
  'Bea',
  'Cal',
  'Dot',
  'Eli',
  'Fay',
  'Gus',
] as const;

export function botClientId(tableId: string, seatIndex: number): string {
  return `bot:${tableId}:${seatIndex}`;
}

export function botName(seatIndex: number): string {
  const name = BOT_NAMES[seatIndex - 1];
  return name ?? 'Bot';
}

/** A solo room only accepts the client who started it. */
export function soloJoinRejection(
  solo: boolean,
  memberExists: boolean,
): string | undefined {
  if (solo && !memberExists) {
    return 'Room is private';
  }
  return undefined;
}

/** A client reducer cannot act for a bot seat. The runner applies those. */
export function botIntentRejection(isBot: boolean): string | undefined {
  if (isBot) {
    return 'Bot seats play on their own';
  }
  return undefined;
}

/** The human leaving a solo room removes that room. */
export function soloLeaveRemovesRoom(
  solo: boolean,
  leaverIsBot: boolean,
): boolean {
  return solo && !leaverIsBot;
}
