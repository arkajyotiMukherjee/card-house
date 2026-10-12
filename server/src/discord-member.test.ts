import { discordProfile } from './discord-member.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(run: () => void, message: string): void {
  let thrown = false;
  try {
    run();
  } catch (error: unknown) {
    thrown = true;
    const text = error instanceof Error ? error.message : '';
    assert(text === message, `expected "${message}", got "${text}"`);
  }
  assert(thrown, `expected ${message}`);
}

const USER_ID = '424242424242424242';

const profile = discordProfile(USER_ID, 'bea_cards', 'Bea Cards', '0042');
assert(profile.discordUserId === USER_ID, 'user id is stored');
assert(profile.discordUsername === 'bea_cards', 'username is stored');
assert(profile.discordGlobalName === 'Bea Cards', 'global name is stored');
assert(profile.discordDiscriminator === '0042', 'sent discriminator is stored');

const withoutTag = discordProfile(USER_ID, 'bea_cards', 'Bea Cards');
assert(
  withoutTag.discordDiscriminator === undefined,
  'omitted discriminator is not stored',
);

const blankTag = discordProfile(USER_ID, 'bea_cards', '', '  ');
assert(
  blankTag.discordDiscriminator === undefined,
  'blank discriminator is not stored',
);
assert(blankTag.discordGlobalName === '', 'empty global name is allowed');

const zeroTag = discordProfile(USER_ID, 'bea_cards', 'Bea', '0');
assert(
  zeroTag.discordDiscriminator === undefined,
  'discriminator 0 is not stored',
);

assertThrows(
  () => discordProfile('nope', 'bea_cards', 'Bea'),
  'Discord user id is invalid',
);
assertThrows(
  () => discordProfile(USER_ID, '', 'Bea'),
  'Discord username is invalid',
);
assertThrows(
  () => discordProfile(USER_ID, 'bea_cards', 'Bea', '12'),
  'Discord discriminator is invalid',
);

console.log('discord member identity ok');
