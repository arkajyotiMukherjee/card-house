import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupDefaultPlayerName } from './discord-user.ts';

const USER_ID = '80351110224678912';
const live = process.env.DISCORD_NAME_LIVE === '1';

test(
  'the live Discord token lookup returns 401 and no invented user',
  { skip: live ? false : 'set DISCORD_NAME_LIVE=1 to call Discord' },
  async () => {
    const token = process.env.DISCORD_BOT_TOKEN?.trim() ?? '';
    assert.ok(token.length > 0, 'DISCORD_BOT_TOKEN is required');
    const result = await lookupDefaultPlayerName(USER_ID, token);
    const evidence = {
      discordUserId: USER_ID,
      status: result.status,
      ok: result.ok,
      name: result.name,
    };
    console.log(JSON.stringify(evidence));
    assert.equal(result.status, 401);
    assert.equal(result.ok, false);
    assert.equal(result.name, null);
  },
);
