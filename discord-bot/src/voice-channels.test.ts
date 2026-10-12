import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InteractionType } from 'discord-interactions';
import { DiscordHttpError } from './discord-http.ts';
import { handleInteraction } from './interactions.ts';
import { recordedDiscordApi } from './recorded-discord.ts';
import {
  attachLobbyVoice,
  createVoiceSession,
  lobbyVoiceChannelName,
  tableVoiceChannelName,
  voiceChannelClient,
  type VoiceChannelClient,
  type VoiceLobbyRow,
  type VoiceSnapshot,
  type VoiceTableRow,
} from './voice-channels.ts';

const GUILD = '223456789012345678';
const TEXT = '323456789012345678';

test('voice channel names follow the lobby and table examples', () => {
  assert.equal(lobbyVoiceChannelName('AB3D'), 'room-ab3d-voice');
  assert.equal(
    tableVoiceChannelName('AB3D', 'bluff', 'bluff #1'),
    'ab3d-bluff-1',
  );
  assert.equal(
    tableVoiceChannelName('AB3D', 'crazy_eights', 'crazy_eights #2'),
    'ab3d-crazy-eights-2',
  );
});

test('a create interaction forwards the guild id', async () => {
  const seen: string[] = [];
  await handleInteraction(
    {
      type: InteractionType.APPLICATION_COMMAND,
      channel_id: TEXT,
      guild_id: GUILD,
      data: { name: 'cardroom', options: [{ name: 'create', type: 1 }] },
    },
    {
      createLobby: (channelId, guildId) => {
        seen.push(`${channelId}:${guildId ?? ''}`);
        return Promise.resolve({
          code: 'AB3D',
          joinUrl: 'http://127.0.0.1:5173/AB3D',
          discordChannelId: TEXT,
          reducer: 'create_lobby',
        });
      },
      lobbyStatus: () => ({
        code: '',
        found: false,
        live: false,
        tables: 0,
        players: 0,
      }),
    },
  );
  assert.deepEqual(seen, [`${TEXT}:${GUILD}`]);
});

test('attach stores the lobby voice channel from the Discord API', async () => {
  const api = recordedDiscordApi();
  const voice = voiceChannelClient(api);
  const { snapshot } = memory();
  const attached = await attachLobbyVoice(snapshot, voice, 'AB3D', GUILD);
  const channel = api.channels()[0];
  assert.ok(attached);
  assert.equal(attached.discordGuildId, GUILD);
  assert.equal(attached.discordLobbyVoiceChannelId, channel?.id);
  assert.equal(channel?.name, 'room-ab3d-voice');
  assert.equal(channel?.type, 2);
  assert.equal(api.calls[0]?.method, 'POST');
  assert.equal(api.calls[0]?.path, `/guilds/${GUILD}/channels`);
  const lobby = [...snapshot.db.lobby.iter()][0];
  assert.equal(lobby?.discordGuildId, GUILD);
  assert.equal(lobby?.discordLobbyVoiceChannelId, channel?.id);
});

test('a Discord 401 leaves the lobby without a voice channel', async () => {
  const { snapshot, counter } = memory();
  const voice = failingVoice(401);
  const attached = await attachLobbyVoice(snapshot, voice, 'AB3D', GUILD);
  assert.equal(attached, undefined);
  assert.equal(counter.sets, 0);
  assert.equal(
    [...snapshot.db.lobby.iter()][0]?.discordLobbyVoiceChannelId,
    '',
  );
});

test('a rate limit leaves the lobby without a voice channel', async () => {
  const { snapshot, counter } = memory();
  const attached = await attachLobbyVoice(
    snapshot,
    failingVoice(429),
    'AB3D',
    GUILD,
  );
  assert.equal(attached, undefined);
  assert.equal(counter.sets, 0);
});

test('a failed voice write deletes the channel it just created', async () => {
  const api = recordedDiscordApi();
  const { snapshot } = memory({ failSet: true });
  const attached = await attachLobbyVoice(
    snapshot,
    voiceChannelClient(api),
    'AB3D',
    GUILD,
  );
  assert.equal(attached, undefined);
  assert.deepEqual(api.channels(), []);
  assert.equal(api.calls.at(-1)?.method, 'DELETE');
});

test('a Discord table gets a voice channel and a web table does not', async () => {
  const api = recordedDiscordApi();
  const voice = voiceChannelClient(api);
  const { snapshot } = memory({
    guildId: GUILD,
    voiceId: '900000000000000111',
  });
  const session = createVoiceSession(voice);
  const web = table('web-table', 'web-lobby');
  snapshot.db.gameTable.rows.push(web);
  await session.onTableInsert(snapshot, web);
  assert.equal(api.channels().length, 0);

  const discordTable = table('table-1', 'lobby-1');
  snapshot.db.gameTable.rows.push(discordTable);
  await session.onTableInsert(snapshot, discordTable);
  assert.equal(api.channels()[0]?.name, 'ab3d-bluff-1');
  assert.equal(discordTable.discordVoiceChannelId, api.channels()[0]?.id);
});

test('finishing a table deletes its voice channel and clears the id', async () => {
  const api = recordedDiscordApi();
  const voice = voiceChannelClient(api);
  const created = await voice.createVoiceChannel(GUILD, 'ab3d-bluff-1');
  const { snapshot } = memory({
    guildId: GUILD,
    voiceId: '900000000000000111',
  });
  const row = table('table-1', 'lobby-1', created.id);
  snapshot.db.gameTable.rows.push(row);
  const session = createVoiceSession(voice);
  await session.onTableUpdate(
    snapshot,
    { ...row, status: { tag: 'waiting_for_players' } },
    { ...row, status: { tag: 'finished' } },
  );
  assert.equal(
    api.channels().some((channel) => channel.id === created.id),
    false,
  );
  assert.equal(row.discordVoiceChannelId, '');
});

test('removing a table deletes its voice channel', async () => {
  const api = recordedDiscordApi();
  const voice = voiceChannelClient(api);
  const created = await voice.createVoiceChannel(GUILD, 'ab3d-bluff-1');
  const session = createVoiceSession(voice);
  await session.onTableDelete(table('table-1', 'lobby-1', created.id));
  assert.equal(
    api.channels().some((channel) => channel.id === created.id),
    false,
  );
  assert.equal(api.calls.at(-1)?.method, 'DELETE');
});

test('closing a lobby deletes the lobby channel and remaining table channels', async () => {
  const api = recordedDiscordApi();
  const voice = voiceChannelClient(api);
  const lobbyChannel = await voice.createVoiceChannel(GUILD, 'room-ab3d-voice');
  const tableChannel = await voice.createVoiceChannel(GUILD, 'ab3d-bluff-2');
  const { snapshot } = memory({ guildId: GUILD, voiceId: lobbyChannel.id });
  const row = table('table-2', 'lobby-1', tableChannel.id, 'bluff #2');
  snapshot.db.gameTable.rows.push(row);
  const session = createVoiceSession(voice);
  const lobby = [...snapshot.db.lobby.iter()][0];
  assert.ok(lobby);
  await session.onLobbyUpdate(
    snapshot,
    { ...lobby, status: { tag: 'open' } },
    { ...lobby, status: { tag: 'closed' } },
  );
  assert.deepEqual(api.channels(), []);
  assert.equal(lobby.discordLobbyVoiceChannelId, '');
  assert.equal(row.discordVoiceChannelId, '');
});

function failingVoice(status: number): VoiceChannelClient {
  return {
    createVoiceChannel: () =>
      Promise.reject(new DiscordHttpError(status, 30_000)),
    deleteChannel: () => Promise.resolve(),
  };
}

function memory(options?: {
  guildId?: string;
  voiceId?: string;
  failSet?: boolean;
}): {
  snapshot: VoiceSnapshot & {
    db: {
      lobby: { rows: VoiceLobbyRow[]; iter(): Iterable<VoiceLobbyRow> };
      gameTable: { rows: VoiceTableRow[]; iter(): Iterable<VoiceTableRow> };
    };
  };
  counter: { sets: number };
} {
  const lobby: VoiceLobbyRow = {
    id: 'lobby-1',
    code: 'AB3D',
    status: { tag: 'open' },
    discordGuildId: options?.guildId ?? '',
    discordLobbyVoiceChannelId: options?.voiceId ?? '',
  };
  const lobbies = [lobby];
  const tables: VoiceTableRow[] = [];
  const counter = { sets: 0 };
  const snapshot = {
    reducers: {
      setLobbyDiscordVoice: (args: {
        lobbyCode: string;
        discordGuildId: string;
        discordLobbyVoiceChannelId: string;
      }) => {
        if (options?.failSet) {
          return Promise.reject(new Error('write failed'));
        }
        counter.sets += 1;
        lobby.discordGuildId = args.discordGuildId;
        lobby.discordLobbyVoiceChannelId = args.discordLobbyVoiceChannelId;
        return Promise.resolve();
      },
      clearLobbyDiscordVoice: () => {
        lobby.discordLobbyVoiceChannelId = '';
        return Promise.resolve();
      },
      setTableDiscordVoice: (args: {
        tableId: string;
        discordVoiceChannelId: string;
      }) => {
        const row = tables.find((item) => item.id === args.tableId);
        if (!row) {
          return Promise.reject(new Error('missing table'));
        }
        row.discordVoiceChannelId = args.discordVoiceChannelId;
        return Promise.resolve();
      },
      clearTableDiscordVoice: (args: { tableId: string }) => {
        const row = tables.find((item) => item.id === args.tableId);
        if (row) {
          row.discordVoiceChannelId = '';
        }
        return Promise.resolve();
      },
    },
    db: {
      lobby: {
        rows: lobbies,
        iter: () => lobbies,
      },
      gameTable: {
        rows: tables,
        iter: () => tables,
      },
    },
  };
  return { snapshot, counter };
}

function table(
  id: string,
  lobbyId: string,
  voiceId = '',
  name = 'bluff #1',
): VoiceTableRow {
  return {
    id,
    lobbyId,
    gameType: 'bluff',
    name,
    status: { tag: 'waiting_for_players' },
    discordVoiceChannelId: voiceId,
  };
}
