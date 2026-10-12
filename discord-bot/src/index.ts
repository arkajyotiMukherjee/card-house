import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { registerSlashCommands } from './commands.ts';
import { discordRestApi } from './discord-http.ts';
import { connectLobby } from './lobby-client.ts';
import { createApp } from './server.ts';
import { connectVoiceGateway } from './voice-gateway.ts';
import { recordVoiceState, syncGuildVoice } from './voice-presence.ts';
import {
  attachVoiceWatch,
  createDiscordLobbyWithVoice,
  voiceChannelClient,
  type VoiceChannelClient,
} from './voice-channels.ts';

export async function main(): Promise<void> {
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
  if (token.length > 0 && applicationId.length > 0) {
    await registerSlashCommands({
      token,
      applicationId,
      guildId: process.env.DISCORD_GUILD_ID,
    });
    console.log('Registered /cardroom create');
  } else {
    console.log(
      'DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID is unset; slash command registration skipped',
    );
  }

  const connection = await connectLobby(host, database);
  if (voice) {
    attachVoiceWatch(connection, voice);
    let queue: Promise<void> = Promise.resolve();
    const enqueue = (task: () => Promise<void>): void => {
      queue = queue.then(task, task);
    };
    connectVoiceGateway({
      token,
      handlers: {
        onGuildVoice: (guildId, states) => {
          enqueue(() => syncGuildVoice(connection, guildId, states));
        },
        onVoiceState: (_guildId, state) => {
          enqueue(() => recordVoiceState(connection, state));
        },
      },
    });
  }
  const app = createApp({
    publicKey,
    createLobby: (discordChannelId, guildId) =>
      createDiscordLobbyWithVoice(
        connection,
        voice,
        discordChannelId,
        guildId,
        publicUrl,
      ),
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      resolve();
    });
  });
  console.log(`Discord interactions listening on ${port}`);
}

const invoked = process.argv[1];
if (invoked && pathToFileURL(invoked).href === import.meta.url) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Bot failed';
    console.error(message);
    process.exitCode = 1;
  });
}
