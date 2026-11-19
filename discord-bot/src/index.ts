import { readFileSync, writeFileSync } from 'node:fs';
import { attachLeaderboardWatch, readLeaderboard } from './leaderboard.ts';
import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { registerSlashCommands } from './commands.ts';
import { discordRestApi } from './discord-http.ts';
import { lookupDefaultPlayerName } from './discord-user.ts';
import { connectLobby } from './lobby-client.ts';
import { closeEmptyRoom } from './lobby-close.ts';
import { readLobbyStatus } from './lobby-status.ts';
import { createApp } from './server.ts';
import { attachSpeakingWatch } from './speaking.ts';
import {
  createSpeakingGateway,
  probeSpeakingGateway,
} from './speaking-gateway.ts';
import { attachCasinoLink, watchCasinoVoiceMoves } from './casino-discord.ts';
import { connectVoiceGateway } from './voice-gateway.ts';
import { recordVoiceState, syncGuildVoice } from './voice-presence.ts';
import {
  attachVoiceWatch,
  createDiscordLobbyWithVoice,
  voiceChannelClient,
  type VoiceChannelClient,
} from './voice-channels.ts';

function redact(message: string, token: string): string {
  return token.length > 0 ? message.split(token).join('[redacted]') : message;
}

export async function main(attached?: Server): Promise<void> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim() ?? '';
  if (publicKey.length === 0) {
    throw new Error('DISCORD_PUBLIC_KEY is required');
  }
  const host = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
  const database = process.env.SPACETIMEDB_DB ?? 'cardroom';
  const publicUrl = process.env.CARDROOM_PUBLIC_URL ?? 'http://127.0.0.1:5173';
  const port = Number(process.env.PORT ?? '8787');
  const token = process.env.DISCORD_BOT_TOKEN?.trim() ?? '';
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim() ?? '';
  const voice: VoiceChannelClient | undefined =
    token.length > 0
      ? voiceChannelClient(discordRestApi({ token }))
      : undefined;
  let connection: Awaited<ReturnType<typeof connectLobby>> | undefined;
  const app = createApp({
    publicKey,
    createLobby: (discordChannelId, guildId, startingCoins) => {
      if (!connection) {
        return Promise.reject(new Error('Still connecting to SpacetimeDB'));
      }
      return createDiscordLobbyWithVoice(
        connection,
        voice,
        discordChannelId,
        guildId,
        publicUrl,
        undefined,
        startingCoins,
      );
    },
    lookupPlayerName: (discordUserId) =>
      lookupDefaultPlayerName(discordUserId, token),
    lobbyStatus: (roomCode) => {
      if (!connection) {
        return Promise.reject(new Error('Still connecting to SpacetimeDB'));
      }
      return readLobbyStatus(connection, roomCode);
    },
    leaderboard: (channelId, roomCode, page) => {
      if (!connection) throw new Error('Still connecting to SpacetimeDB');
      return readLeaderboard(connection, channelId, roomCode, page);
    },
    closeRoom: (roomCode) => {
      if (!connection) {
        return Promise.reject(new Error('Still connecting to SpacetimeDB'));
      }
      return closeEmptyRoom(connection, roomCode);
    },
  });
  attachCasinoLink(app, {
    applicationId,
    secret: process.env.DISCORD_OAUTH_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.DISCORD_OAUTH_REDIRECT_URI?.trim() ?? '',
    isReady: () => connection?.isActive === true,
    complete: async (id, discordUserId) => {
      if (!connection) throw new Error('Still connecting to SpacetimeDB');
      await connection.reducers.completeCasinoDiscordLink({
        id,
        discordUserId,
      });
    },
  });
  if (attached) {
    attached.removeAllListeners('request');
    attached.on('request', app);
  } else {
    const server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => {
        resolve();
      });
    });
  }
  console.log(`Discord interactions listening on ${port}`);

  if (token.length > 0 && applicationId.length > 0) {
    try {
      await registerSlashCommands({
        token,
        applicationId,
        guildId: process.env.DISCORD_GUILD_ID,
      });
      console.log(
        'Registered /cardhouse create, /cardhouse status, and /cardhouse leaderboard',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Bot failed';
      console.error(redact(message, token));
    }
  } else {
    console.log(
      'DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID is unset; slash command registration skipped',
    );
  }

  if (typeof globalThis.WebSocket !== 'function') {
    const undici = await import('undici');
    globalThis.WebSocket =
      undici.WebSocket as unknown as typeof globalThis.WebSocket;
  }
  try {
    const sessionFile =
      process.env.CARDHOUSE_BOT_SESSION_FILE ??
      new URL('../.session-token', import.meta.url).pathname;
    connection = await connectLobby(host, database, {
      read() {
        try {
          return readFileSync(sessionFile, 'utf8').trim() || undefined;
        } catch {
          return undefined;
        }
      },
      write(value) {
        writeFileSync(sessionFile, value, { mode: 0o600 });
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bot failed';
    console.error(redact(message, token));
    return;
  }
  const lobby = connection;
  if (token.length > 0)
    attachLeaderboardWatch(lobby, discordRestApi({ token }), (error) =>
      console.error(
        redact(
          error instanceof Error
            ? error.message
            : 'Leaderboard delivery failed',
          token,
        ),
      ),
    );
  if (voice) {
    try {
      attachVoiceWatch(lobby, voice);
      let queue: Promise<void> = Promise.resolve();
      const failed = (error: unknown): void => {
        console.error(
          redact(
            error instanceof Error
              ? error.message
              : 'Discord casino update failed',
            token,
          ),
        );
      };
      const moves = watchCasinoVoiceMoves(
        lobby.db.myCasinoVoiceTargets,
        discordRestApi({ token }),
        failed,
      );
      const enqueue = (task: () => Promise<void>): void => {
        queue = queue.then(task).catch(failed);
      };
      lobby.db.casinoDiscordMember.onInsert((_ctx, row) => {
        const guildId = lobby.db.lobby.id.find(row.lobbyId)?.discordGuildId;
        const channelId =
          guildId && moves.channelFor(guildId, row.discordUserId);
        if (channelId)
          enqueue(async () => {
            await recordVoiceState(lobby, {
              userId: row.discordUserId,
              channelId,
            });
            moves.refresh();
          });
      });
      connectVoiceGateway({
        token,
        handlers: {
          onDisconnect: moves.reset,
          onGuildVoice: (guildId, states) => {
            moves.resyncGuild(guildId);
            for (const state of states)
              moves.record(guildId, state.userId, state.channelId);
            enqueue(async () => {
              await syncGuildVoice(lobby, guildId, states);
              moves.refresh();
            });
          },
          onVoiceState: (guildId, state) => {
            moves.record(guildId, state.userId, state.channelId);
            enqueue(async () => {
              await recordVoiceState(lobby, state);
              moves.refresh();
            });
          },
          onCasinoMessage:
            process.env.CARDHOUSE_DISCORD_CHAT === '1'
              ? (message) => {
                  const isVoice =
                    [...lobby.db.lobby.iter()].some(
                      (row) =>
                        row.discordLobbyVoiceChannelId === message.channelId,
                    ) ||
                    [...lobby.db.gameTable.iter()].some(
                      (row) => row.discordVoiceChannelId === message.channelId,
                    );
                  if (isVoice)
                    enqueue(() =>
                      lobby.reducers.mirrorCasinoDiscordMessage(message),
                    );
                }
              : undefined,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Bot failed';
      console.error(redact(message, token));
    }
  }
  if (token.length > 0) {
    try {
      const speakingProbe = await probeSpeakingGateway(token);
      if (speakingProbe.status === 401) {
        console.log('Discord speaking gateway unauthorized (401)');
      }
      attachSpeakingWatch(lobby, createSpeakingGateway(token, speakingProbe));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Bot failed';
      console.error(redact(message, token));
    }
  }
}

const invoked = process.argv[1];
if (invoked && pathToFileURL(invoked).href === import.meta.url) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Bot failed';
    console.error(message);
    process.exitCode = 1;
  });
}
