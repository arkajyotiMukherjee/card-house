/** Lobby-wide chat. One row per message, visible to every member of that lobby. */

export const CHAT_BODY_MAX = 500;

/** Returns a rejection reason, or `undefined` when the body may be stored. */
export function chatBodyRejection(body: string): string | undefined {
  if (body.length === 0) {
    return 'Message is required';
  }
  if (body.length > CHAT_BODY_MAX) {
    return 'Message is too long';
  }
  return undefined;
}

/** Zero-padded so chat ids sort in send order for one lobby. */
export function chatMessageId(lobbyId: string, order: number): string {
  let suffix = order.toString();
  while (suffix.length < 8) {
    suffix = `0${suffix}`;
  }
  return `chat_${lobbyId}_${suffix}`;
}
