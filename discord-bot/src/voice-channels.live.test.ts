import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import nacl from 'tweetnacl';
import { InteractionType } from 'discord-interactions';
import { probeDiscordBot } from './discord-http.ts';
import { connectLobby } from './lobby-client.ts';
import { recordedDiscordApi } from './recorded-discord.ts';
import { createApp } from './server.ts';
import {
  attachVoiceWatch,
  createDiscordLobbyWithVoice,
  voiceChannelClient,
} from './voice-channels.ts';

const TEXT = '323456789012345678';
const live = process.env.CARDROOM_LIVE === '1';

test(
  'cardhouse create stores a lobby voice channel, and closing a table or lobby deletes it',
  { skip: live ? false : 'set CARDROOM_LIVE=1 to call the published module' },
  async () => {
    const token = process.env.DISCORD_BOT_TOKEN ?? '';
    const probe = await probeDiscordBot(token);
    const api = recordedDiscordApi();
    const voice = voiceChannelClient(api);
    const host = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
    const database = process.env.SPACETIMEDB_DB ?? 'cardroom';
    const publicUrl =
      process.env.CARDROOM_PUBLIC_URL ?? 'http://127.0.0.1:5173';
    const guildId = `${Date.now()}`.padStart(18, '9').slice(0, 18);
    const connection = await connectLobby(host, database);
    const stopWatch = attachVoiceWatch(connection, voice);
    let server: Server | undefined;
    try {
      const knownIds = new Set(
        [...connection.db.lobby.iter()].map((lobby) => lobby.id),
      );
      const keyPair = nacl.sign.keyPair();
      const app = createApp({
        publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
        createLobby: (channelId, guild) =>
          createDiscordLobbyWithVoice(
            connection,
            voice,
            channelId,
            guild,
            publicUrl,
          ),
        lobbyStatus: () => ({
          code: '',
          found: false,
          live: false,
          tables: 0,
          players: 0,
        }),
        closeRoom: () => Promise.reject(new Error('unused')),
      });
      server = createServer(app);
      await listen(server);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('test server has no port');
      }
      const response = await postInteraction(
        `http://127.0.0.1:${address.port}/interactions`,
        keyPair.secretKey,
        {
          type: InteractionType.APPLICATION_COMMAND,
          channel_id: TEXT,
          guild_id: guildId,
          data: { name: 'cardhouse', options: [{ name: 'create', type: 1 }] },
        },
      );
      const payload = (await response.json()) as {
        type: number;
        data?: { content?: string };
      };
      const content = payload.data?.content ?? '';
      const code = /^Lobby ([A-Z0-9]+)\n/.exec(content)?.[1] ?? '';
      const lobby = await waitFor(
        () =>
          [...connection.db.lobby.iter()].find(
            (row) =>
              row.code === code && row.discordLobbyVoiceChannelId.length > 0,
          ),
        'lobby voice channel id',
      );
      const lobbyChannel = api
        .channels()
        .find((channel) => channel.id === lobby.discordLobbyVoiceChannelId);
      await connection.reducers.createGameTable({
        lobbyId: lobby.id,
        gameType: 'bluff',
        settings: JSON.stringify({
          name: 'Bluff #1',
          minPlayers: 2,
          maxPlayers: 6,
        }),
      });
      const table = await waitFor(
        () =>
          [...connection.db.gameTable.iter()].find(
            (row) =>
              row.lobbyId === lobby.id && row.discordVoiceChannelId.length > 0,
          ),
        'table voice channel id',
      );
      const tableChannel = api
        .channels()
        .find((channel) => channel.id === table.discordVoiceChannelId);
      await connection.reducers.removeGameTable({ tableId: table.id });
      await waitFor(() => {
        const gone = ![...connection.db.gameTable.iter()].some(
          (row) => row.id === table.id,
        );
        const deleted = !api
          .channels()
          .some((channel) => channel.id === table.discordVoiceChannelId);
        return gone && deleted ? true : undefined;
      }, 'removed table voice channel');
      await connection.reducers.createGameTable({
        lobbyId: lobby.id,
        gameType: 'bluff',
        settings: JSON.stringify({
          name: 'Bluff #1',
          minPlayers: 2,
          maxPlayers: 6,
        }),
      });
      const second = await waitFor(
        () =>
          [...connection.db.gameTable.iter()].find(
            (row) =>
              row.lobbyId === lobby.id && row.discordVoiceChannelId.length > 0,
          ),
        'second table voice channel id',
      );
      const secondChannelId = second.discordVoiceChannelId;
      await connection.reducers.closeLobby({ lobbyCode: lobby.code });
      const closed = await waitFor(() => {
        const row = [...connection.db.lobby.iter()].find(
          (item) => item.id === lobby.id,
        );
        const tableRow = [...connection.db.gameTable.iter()].find(
          (item) => item.id === second.id,
        );
        const channelsGone =
          !api
            .channels()
            .some(
              (channel) => channel.id === lobby.discordLobbyVoiceChannelId,
            ) &&
          !api.channels().some((channel) => channel.id === secondChannelId);
        if (
          row &&
          row.discordLobbyVoiceChannelId.length === 0 &&
          tableRow &&
          tableRow.discordVoiceChannelId.length === 0 &&
          channelsGone
        ) {
          return { lobby: row, table: tableRow };
        }
        return undefined;
      }, 'closed lobby voice channels');

      const evidence = {
        discordProbe: probe,
        voiceSource: 'recorded-discord-api',
        discordReply: payload,
        guildId,
        lobby: {
          id: lobby.id,
          code: lobby.code,
          discordGuildId: lobby.discordGuildId,
          discordLobbyVoiceChannelId: lobby.discordLobbyVoiceChannelId,
          voiceName: lobbyChannel?.name,
        },
        table: {
          id: table.id,
          discordVoiceChannelId: table.discordVoiceChannelId,
          voiceName: tableChannel?.name,
        },
        afterRemove: {
          tableGone: ![...connection.db.gameTable.iter()].some(
            (row) => row.id === table.id,
          ),
          channelDeleted: !api
            .channels()
            .some((channel) => channel.id === table.discordVoiceChannelId),
        },
        afterClose: {
          lobbyStatus: closed.lobby.status.tag,
          discordLobbyVoiceChannelId: closed.lobby.discordLobbyVoiceChannelId,
          tableVoiceChannelId: closed.table.discordVoiceChannelId,
          channels: api.channels(),
        },
        calls: api.calls.map((call) => ({
          method: call.method,
          path: call.path,
          body: call.body,
        })),
      };
      console.log(JSON.stringify(evidence, null, 2));

      assert.equal(probe.status, 401);
      assert.equal(JSON.stringify(evidence).includes(token.trim()), false);
      assert.equal(response.status, 200);
      assert.equal(payload.type, 4);
      assert.equal(lobby.discordGuildId, guildId);
      assert.equal(lobbyChannel?.name, `room-${code.toLowerCase()}-voice`);
      assert.equal(lobbyChannel?.type, 2);
      assert.equal(tableChannel?.name, `${code.toLowerCase()}-bluff-1`);
      assert.equal(knownIds.has(lobby.id), false);
      assert.equal(closed.lobby.discordLobbyVoiceChannelId, '');
      assert.equal(closed.table.discordVoiceChannelId, '');
      assert.equal(
        api.channels().some((channel) => channel.guildId === guildId),
        false,
      );
    } finally {
      stopWatch();
      connection.disconnect();
      if (server?.listening) {
        await new Promise<void>((resolve) => {
          server?.close(() => {
            resolve();
          });
        });
      }
    }
  },
);

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
}

async function postInteraction(
  url: string,
  secretKey: Uint8Array,
  body: unknown,
): Promise<Response> {
  const encoded = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = Buffer.from(
    nacl.sign.detached(Buffer.from(timestamp + encoded), secretKey),
  ).toString('hex');
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': signature,
      'X-Signature-Timestamp': timestamp,
    },
    body: encoded,
  });
}

async function waitFor<T>(
  read: () => T | undefined,
  label: string,
): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = read();
    if (value) {
      return value;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error(label);
}
