import {
  CHAT_BODY_MAX,
  chatBodyRejection,
  chatMessageId,
} from './lobby-chat.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  chatBodyRejection('hello lobby') === undefined,
  'a normal message is accepted',
);
assert(
  chatBodyRejection('') === 'Message is required',
  'an empty message is rejected',
);
assert(
  chatBodyRejection('x'.repeat(CHAT_BODY_MAX)) === undefined,
  'a message at the max length is accepted',
);
assert(
  chatBodyRejection('x'.repeat(CHAT_BODY_MAX + 1)) === 'Message is too long',
  'a message past the max length is rejected',
);

assert(
  chatMessageId('lobby_1', 0) === 'chat_lobby_1_00000000',
  'the first message in a lobby is zero-padded',
);
assert(
  chatMessageId('lobby_1', 12) === 'chat_lobby_1_00000012',
  'later messages keep the fixed width',
);
assert(
  chatMessageId('lobby_1', 0) < chatMessageId('lobby_1', 1),
  'ids for the same lobby sort in send order',
);

console.log(JSON.stringify({ ok: true }));
