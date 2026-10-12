import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultPlayerName,
  readDiscordJoinIdentity,
  withDiscordIdentity,
  type DiscordUserProfile,
} from '../../src/shared/discord-player-name.ts';

/** Discord API user example. Not a response from this environment's token. */
const DOCUMENTED_USER: DiscordUserProfile = {
  id: '80351110224678912',
  username: 'nelly',
  globalName: null,
};

test('a documented Discord user maps to the username when global name is unset', () => {
  assert.equal(defaultPlayerName(DOCUMENTED_USER), 'nelly');
});

test('the global name is the default player name when Discord set one', () => {
  assert.equal(
    defaultPlayerName({ ...DOCUMENTED_USER, globalName: 'Nelly' }),
    'Nelly',
  );
});

test('a long Discord name is cut to the lobby name length', () => {
  assert.equal(
    defaultPlayerName({
      ...DOCUMENTED_USER,
      globalName: 'Prince of Wales',
    }),
    'Prince of Wa',
  );
});

test('username punctuation becomes spaces and an unreadable global name is skipped', () => {
  assert.equal(
    defaultPlayerName({
      id: DOCUMENTED_USER.id,
      username: 'ada_lovelace',
      globalName: '!!!',
    }),
    'ada lovelace',
  );
  assert.equal(
    defaultPlayerName({
      id: DOCUMENTED_USER.id,
      username: 'a.b_c',
      globalName: null,
    }),
    'a b c',
  );
});

test('an id that is not a Discord user id does not invent a name', () => {
  assert.equal(
    defaultPlayerName({
      id: 'not-a-user',
      username: 'nelly',
      globalName: null,
    }),
    '',
  );
  assert.equal(
    defaultPlayerName({
      id: DOCUMENTED_USER.id,
      username: '!!!',
      globalName: null,
    }),
    '',
  );
});

test('a join URL keeps a known Discord profile for the default name', () => {
  const url = withDiscordIdentity('http://127.0.0.1:5173/AB3D', {
    ...DOCUMENTED_USER,
    globalName: 'Nelly',
  });
  const identity = readDiscordJoinIdentity(new URL(url).search);
  assert.equal(identity?.source, 'profile');
  if (identity?.source !== 'profile') {
    return;
  }
  assert.equal(defaultPlayerName(identity.user), 'Nelly');
});

test('a user id alone is not treated as a known profile', () => {
  const identity = readDiscordJoinIdentity(
    `?discord_user_id=${DOCUMENTED_USER.id}`,
  );
  assert.deepEqual(identity, {
    source: 'id',
    discordUserId: DOCUMENTED_USER.id,
  });
});
