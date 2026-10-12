import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDROOM_COMMAND, SLASH_COMMANDS } from './commands.ts';

test('the registered command set is /cardroom create', () => {
  assert.equal(SLASH_COMMANDS.length, 1);
  assert.equal(CARDROOM_COMMAND.name, 'cardroom');
  assert.deepEqual(
    CARDROOM_COMMAND.options.map((option) => option.name),
    ['create'],
  );
});
