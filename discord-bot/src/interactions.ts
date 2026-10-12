import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { createReplyContent } from './join-url.ts';
import type { CreatedLobby } from './lobby-client.ts';

const EPHEMERAL = 1 << 6;
const DISCORD_CHANNEL_ID = /^\d{17,20}$/;

export interface DiscordInteraction {
  type: number;
  channel_id?: string;
  guild_id?: string;
  data?: {
    name?: string;
    options?: Array<{ name?: string; type?: number }>;
  };
}

export interface DiscordReply {
  type: number;
  data?: {
    content: string;
    flags?: number;
  };
}

export interface InteractionDeps {
  createLobby: (
    discordChannelId: string,
    guildId?: string,
  ) => Promise<CreatedLobby>;
}

type Subcommand = (
  interaction: DiscordInteraction,
  deps: InteractionDeps,
) => Promise<DiscordReply>;

const subcommands: Record<string, Subcommand> = {
  create: handleCreate,
};

export async function handleInteraction(
  interaction: DiscordInteraction,
  deps: InteractionDeps,
): Promise<DiscordReply> {
  if (interaction.type === InteractionType.PING) {
    return { type: InteractionResponseType.PONG };
  }
  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return ephemeral('Unsupported interaction');
  }
  if (interaction.data?.name !== 'cardroom') {
    return ephemeral('Unknown command');
  }
  const name = interaction.data.options?.[0]?.name ?? '';
  const handler = subcommands[name];
  if (!handler) {
    return ephemeral('Unknown command');
  }
  try {
    return await handler(interaction, deps);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Could not create a lobby';
    return ephemeral(message);
  }
}

async function handleCreate(
  interaction: DiscordInteraction,
  deps: InteractionDeps,
): Promise<DiscordReply> {
  const channelId = interaction.channel_id?.trim() ?? '';
  if (!DISCORD_CHANNEL_ID.test(channelId)) {
    return ephemeral('This command needs a Discord channel');
  }
  const guildId = interaction.guild_id?.trim() ?? '';
  const created = await deps.createLobby(channelId, guildId);
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: createReplyContent(created.code, created.joinUrl),
    },
  };
}

function ephemeral(content: string): DiscordReply {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL },
  };
}
