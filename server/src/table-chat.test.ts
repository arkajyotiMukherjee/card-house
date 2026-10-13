import {
  TABLE_CHAT_BODY_MAX,
  tableChatBodyError,
  tableChatRowId,
  tableChatSenderBlock,
} from './table-chat.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  tableChatBodyError('hello') === undefined,
  'a short message is accepted',
);
assert(
  tableChatBodyError('') === 'Message is required',
  'an empty message is rejected',
);
assert(
  tableChatBodyError('x'.repeat(TABLE_CHAT_BODY_MAX)) === undefined,
  'a message at the max length is accepted',
);
assert(
  tableChatBodyError('x'.repeat(TABLE_CHAT_BODY_MAX + 1)) ===
    'Message is too long',
  'a message past the max length is rejected',
);

assert(
  tableChatSenderBlock({ seated: true, watching: false }) === undefined,
  'a seated player may chat at that table',
);
assert(
  tableChatSenderBlock({ seated: false, watching: true }) === undefined,
  'a spectator at that table may chat',
);
assert(
  tableChatSenderBlock({ seated: false, watching: false }) ===
    'Not at this table',
  'a lobby member with no seat or spectator row at that table is refused',
);

assert(
  tableChatRowId('table_1', 'member_1', 42n) === 'chat_table_1_42_member_1',
  'the row id is table, order, and member so it stays unique per table',
);

console.log(JSON.stringify({ ok: true }));
