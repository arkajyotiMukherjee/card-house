import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDHOUSE_COMMAND, SLASH_COMMANDS } from './commands.ts';

test('the registered command set is /cardhouse create and /cardhouse status', () => {
  assert.equal(SLASH_COMMANDS.length, 1);
  assert.equal(CARDHOUSE_COMMAND.name, 'cardhouse');
  assert.deepEqual(
    CARDHOUSE_COMMAND.options.map((option) => option.name),
    ['create', 'status'],
  );
  const status = CARDHOUSE_COMMAND.options[1];
  assert.equal(status.name, 'status');
  assert.equal(status.options[0].name, 'roomcode');
  assert.equal(status.options[0].required, true);
  assert.equal(status.options[0].type, 3);
});
