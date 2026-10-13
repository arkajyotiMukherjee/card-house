/** A table chat message body may not be empty or exceed this length. */
export const TABLE_CHAT_BODY_MAX = 240;

export function tableChatBodyError(body: string): string | undefined {
  if (body.length === 0) {
    return 'Message is required';
  }
  if (body.length > TABLE_CHAT_BODY_MAX) {
    return 'Message is too long';
  }
  return undefined;
}

/**
 * Only a seated player or a spectator at that table may send a table chat
 * message. A lobby member who is neither is rejected, so chat stays scoped
 * to the one `GameTable` and does not reach the rest of the lobby.
 */
export function tableChatSenderBlock(input: {
  seated: boolean;
  watching: boolean;
}): string | undefined {
  if (input.seated || input.watching) {
    return undefined;
  }
  return 'Not at this table';
}

/** Microsecond timestamps give a unique, time-ordered id per table and member. */
export function tableChatRowId(
  tableId: string,
  lobbyMemberId: string,
  micros: bigint,
): string {
  return `chat_${tableId}_${micros.toString()}_${lobbyMemberId}`;
}
