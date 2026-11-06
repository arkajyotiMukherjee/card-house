import { describe, expect, it } from 'vitest';
import {
  discordIdentityFromSearch,
  roomCodeFromPath,
  tableCodeForId,
  tableLinkFromPath,
} from './join-path';

describe('join path', () => {
  it('reads a four-character room code from the URL path', () => {
    expect(roomCodeFromPath('/AB3D')).toBe('AB3D');
    expect(roomCodeFromPath('/ab3d/')).toBe('AB3D');
  });

  it('ignores the menu and asset paths', () => {
    expect(roomCodeFromPath('/')).toBeUndefined();
    expect(roomCodeFromPath('/assets/cards-hearts.png')).toBeUndefined();
    expect(roomCodeFromPath('/IO01')).toBeUndefined();
    expect(roomCodeFromPath('/ABC')).toBeUndefined();
  });

  it('uses the timestamp and suffix to distinguish tables in a share link', () => {
    const first = tableCodeForId('table_lobby_1700000000000000_0');
    const second = tableCodeForId('table_lobby_1700000000000000_1');
    expect(first).not.toBe(second);
    expect(tableLinkFromPath(`/ab3d/${first.toLowerCase()}`)).toEqual({
      lobbyCode: 'AB3D',
      tableCode: first,
    });
    expect(tableLinkFromPath('/AB3D/unknown')).toBeUndefined();
    expect(tableLinkFromPath(`/AB3D/${first}/extra`)).toBeUndefined();
  });

  it('reads a Discord identity fixture from the query string', () => {
    expect(
      discordIdentityFromSearch(
        '?discordUserId=424242424242424242&discordUsername=bea_cards&discordGlobalName=Bea%20Cards&discordDiscriminator=0042',
      ),
    ).toEqual({
      discordUserId: '424242424242424242',
      discordUsername: 'bea_cards',
      discordGlobalName: 'Bea Cards',
      discordDiscriminator: '0042',
    });
  });

  it('leaves the discriminator off when Discord does not send one', () => {
    expect(
      discordIdentityFromSearch(
        '?discordUserId=424242424242424242&discordUsername=bea_cards&discordGlobalName=Bea',
      ),
    ).toEqual({
      discordUserId: '424242424242424242',
      discordUsername: 'bea_cards',
      discordGlobalName: 'Bea',
    });
    expect(
      discordIdentityFromSearch(
        '?discordUserId=424242424242424242&discordUsername=bea_cards&discordDiscriminator=0',
      )?.discordDiscriminator,
    ).toBeUndefined();
  });

  it('reads the snake_case Discord profile used for the default name', () => {
    expect(
      discordIdentityFromSearch(
        '?discord_user_id=80351110224678912&discord_username=nelly',
      ),
    ).toEqual({
      discordUserId: '80351110224678912',
      discordUsername: 'nelly',
      discordGlobalName: '',
    });
  });

  it('treats a URL without a Discord user id as a web join', () => {
    expect(discordIdentityFromSearch('')).toBeUndefined();
    expect(
      discordIdentityFromSearch('?discordUsername=bea_cards'),
    ).toBeUndefined();
    expect(discordIdentityFromSearch('?discordUserId=')).toBeUndefined();
  });
});
