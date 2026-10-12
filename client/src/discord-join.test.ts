import { describe, expect, it } from 'vitest';
import { joinNameFromSearch } from './discord-join';

const USER_ID = '80351110224678912';

describe('discord join name', () => {
  it('maps a known Discord profile without a lookup', () => {
    expect(
      joinNameFromSearch(`?discord_user_id=${USER_ID}&discord_username=nelly`),
    ).toEqual({ state: 'ready', name: 'nelly' });
  });

  it('prefers the Discord global name', () => {
    expect(
      joinNameFromSearch(
        `?discord_user_id=${USER_ID}&discord_username=nelly&discord_global_name=Nelly`,
      ),
    ).toEqual({ state: 'ready', name: 'Nelly' });
  });

  it('leaves a plain join URL without a default name', () => {
    expect(joinNameFromSearch('')).toEqual({ state: 'ready', name: '' });
  });

  it('asks for a lookup when only the Discord user id is known', () => {
    expect(joinNameFromSearch(`?discord_user_id=${USER_ID}`)).toEqual({
      state: 'lookup',
      discordUserId: USER_ID,
    });
  });
});
