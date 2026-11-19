import {
  defaultPlayerName,
  DISCORD_USER_ID,
  type DiscordUserProfile,
} from '../../src/shared/discord-player-name.ts';

const DISCORD_API = 'https://discord.com/api/v10';

export type PlayerNameLookup =
  | {
      ok: true;
      status: 200;
      discordUserId: string;
      name: string;
      username: string;
    }
  | { ok: false; status: number; discordUserId: string; name: null };

/**
 * Maps a Discord user id to the default player name via `GET /users/{id}`.
 * A failed response, including 401, returns no user and no name.
 */
export async function lookupDefaultPlayerName(
  discordUserId: string,
  token: string,
  fetchUser: typeof fetch = fetch,
): Promise<PlayerNameLookup> {
  const id = discordUserId.trim();
  if (!DISCORD_USER_ID.test(id)) {
    return { ok: false, status: 400, discordUserId: id, name: null };
  }
  if (token.trim().length === 0) {
    return { ok: false, status: 401, discordUserId: id, name: null };
  }
  let response: Response;
  try {
    response = await fetchUser(`${DISCORD_API}/users/${id}`, {
      headers: { Authorization: `Bot ${token.trim()}` },
    });
  } catch {
    return { ok: false, status: 0, discordUserId: id, name: null };
  }
  if (!response.ok) {
    await discardBody(response);
    return {
      ok: false,
      status: response.status,
      discordUserId: id,
      name: null,
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: 502, discordUserId: id, name: null };
  }
  const user = readDiscordUser(body, id);
  if (!user) {
    return { ok: false, status: 502, discordUserId: id, name: null };
  }
  const name = defaultPlayerName(user);
  if (name.length === 0) {
    return { ok: false, status: 502, discordUserId: id, name: null };
  }
  return {
    ok: true,
    status: 200,
    discordUserId: id,
    name,
    username: user.username,
  };
}

function readDiscordUser(
  body: unknown,
  expectedId: string,
): DiscordUserProfile | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const row = body as {
    id?: unknown;
    username?: unknown;
    global_name?: unknown;
  };
  if (row.id !== expectedId || typeof row.username !== 'string') {
    return undefined;
  }
  const globalName =
    typeof row.global_name === 'string' ? row.global_name : null;
  return { id: expectedId, username: row.username, globalName };
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    return;
  }
}
