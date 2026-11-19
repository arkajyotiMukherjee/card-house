import { afterEach, describe, expect, it, vi } from 'vitest';
import { discordLinkAvailable, joinNameFromSearch } from './discord-join';

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

  it('maps the camelCase Discord profile stored on the member', () => {
    expect(
      joinNameFromSearch(
        '?discordUserId=424242424242424242&discordUsername=bea_cards&discordGlobalName=Bea%20Cards',
      ),
    ).toEqual({ state: 'ready', name: 'Bea Cards' });
  });

  it('asks for a lookup when only the Discord user id is known', () => {
    expect(joinNameFromSearch(`?discord_user_id=${USER_ID}`)).toEqual({
      state: 'lookup',
      discordUserId: USER_ID,
    });
  });
});

describe('Discord link availability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows linking only when the bot explicitly reports readiness', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ available: true }));
    vi.stubGlobal('fetch', request);
    expect(await discordLinkAvailable('https://bot.example')).toBe(true);
    expect(request).toHaveBeenCalledWith(
      new URL('https://bot.example/casino/discord/status'),
      expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
    );
  });

  it('recognizes an older bot that has no linking route', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('Cannot GET /casino/discord/status', { status: 404 }),
        ),
    );
    expect(await discordLinkAvailable('https://bot.example')).toBe(false);
  });

  it('treats bot startup and a failed connection as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ available: false }))
        .mockRejectedValueOnce(new Error('Connection refused')),
    );
    expect(await discordLinkAvailable('https://bot.example')).toBe(false);
    expect(await discordLinkAvailable('https://bot.example')).toBe(false);
  });
});
